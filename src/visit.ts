import {Node, ESTree} from './types'
import {NODE_UID_KEY, RUNTIME_VAR_NAME, WRAP_FUNC_PRE, VAR_REPLACE_PRE} from './config'
import {uuid} from './uid'
import {walk} from './astHelper'
import { replaceOrRemoveChild } from './util'
import * as gen from './astCreator'
import { hoist } from './hoist'
import Emitter from './emitter'

function shouldResync(node: Node){
    // @ts-ignore
    if(node.generator){
        return true
        // @ts-ignore
    }else if(node.async){
        return true
    }
    return false
}

const markInfo = {}

function getMarkInfo(node){
    if(!node[NODE_UID_KEY]){
        node[NODE_UID_KEY] = uuid()
    }
    if(!markInfo[node[NODE_UID_KEY]]){
        markInfo[node[NODE_UID_KEY]] = {}
    }
    return markInfo[node[NODE_UID_KEY]]
}

const functionHandler = (node: ESTree.FunctionExpression|ESTree.FunctionDeclaration, parents, parentKeys) => {
    if(!shouldResync(node)) return
    let funcBody = node.body
    let contextName = gen.Identifier({name: 'context'+uuid() })
    // 将所有await xxxx表达式转换成yield Resync.awrap(xxxx)的形式
    // @ts-ignore
    if(node.async){
        walk(funcBody, {
            // skip deeper function walk
            FunctionExpression: () => true,
            AwaitExpression: (node: ESTree.AwaitExpression, parents, parentKeys) => {
                let argument = node.argument
                let father = parents[parents.length - 1]
                let fatherKey = parentKeys[parents.length - 1]
                replaceOrRemoveChild(father, node, fatherKey,
                    gen.YieldExpression(false,
                        gen.CallExpression(
                            gen.MemberExpression(RUNTIME_VAR_NAME, 'awrap', false),
                            argument,
                        )
                    )
                );
            }
        })
    }

    let generatorWraped = null
    if(node.generator){
        /**
         * 如果是generator函数，函数名需要特殊处理一下，在外层再包一层
         * test(){xxxx}
         * ====>
         * test(){
         *     // var i = 123 加在这里
         *     return resyncRuntime.mark(function rs_wraptest(){xxxx})()
         * }
         */
        let wrapFuncName = WRAP_FUNC_PRE+(node.id?node.id.name:('callee_'+uuid()))
        let wrapFunc = gen.FunctionExpression({
            id: gen.Identifier({name: wrapFuncName}),
            params: [],
            body: gen.BlockStatement(funcBody.body)
        })
        // @ts-ignore
        funcBody.body = [gen.ReturnStatement(
            gen.CallExpression(
                gen.CallExpression(
                    gen.MemberExpression(RUNTIME_VAR_NAME, 'mark', false),
                    wrapFunc,
                ), []
            )
        )];
        generatorWraped = {
            name: wrapFuncName,
            func: wrapFunc,
        }
    }

    let innerFunc:ESTree.FunctionExpression = generatorWraped?generatorWraped.func:node
    // 然后就是对原有函数block的转译了
    // 1、处理变量提升
    let vars = hoist(innerFunc)

    // 2、处理this和arguments变量，如果原函数体内存在this或者arguments访问，就需要转译this，保存的this变量存放于原始函数的最上层
    let context = {
        useThis: false,
        useArguments: false,
    }
    walk(innerFunc, {
        FunctionExpression: ()=>true,
        FunctionDeclaration: ()=>true,
        ClassDeclaration: ()=>true,
        ClassExpression: ()=>true,
        ThisExpression: ()=>{
            context.useThis = true
        },
        Identifier: (node:ESTree.Identifier, parents, parentKeys)=>{
            if(node.name == 'arguments') {
                // 替换这个arguments
                let father = parents[parents.length - 1]
                let fatherKey = parentKeys[parents.length - 1]
                replaceOrRemoveChild(father, node, fatherKey, gen.Identifier({
                    name: VAR_REPLACE_PRE+'arguments'
                }))
                context.useArguments = true
            }
        },
    })
    if(context.useArguments){
        vars = vars || gen.VariableDeclaration('var', [])
        vars.declarations.push(gen.VariableDeclarator({
            id: gen.Identifier({name: VAR_REPLACE_PRE+'arguments'}),
            init: gen.Identifier({name: 'arguments'}),
        }))
    }

    // 3. 最重要的部分，转译函数体
    let emitter = new Emitter(contextName)
    emitter.explode(innerFunc)

    // 4. 后续工作
    if(vars && vars.declarations.length){

    }

}

function resync(node: Node){
    walk(node, {
        FunctionExpression: functionHandler,
        FunctionDeclaration: functionHandler,
        ArrowFunctionExpression: (node: ESTree.ArrowFunctionExpression, parents, parentKeys) => {
            // 箭头函数不可能是generator，只可能是async
            if(!shouldResync(node)) return

        },
    })
}

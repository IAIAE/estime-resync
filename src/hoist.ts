import {ESTree, Node} from './types'
import {walk} from './astHelper'
let hasOwn = Object.prototype.hasOwnProperty;
import * as gen from './astCreator'
import {removeChild, replaceOrRemoveChild} from './util'
import { uuid } from './uid';

/**
 * 找到node下级所有的变量声明，改变量声明为赋值，然后记录变量名，
 * 最终返回记录的变量名数组，以便上级统一声明这些变量
 * @param functionNode
 */
export function hoist(functionNode: ESTree.FunctionExpression| ESTree.ArrowFunctionExpression){
    let vars = {}

    function varDeclToExpr(vdec: ESTree.VariableDeclaration, includeIdentifiers: boolean){
        let exprs = [];
        vdec.declarations.forEach(dec=>{
            let name = (dec.id as ESTree.Identifier).name
            vars[name] = gen.Identifier({
                name,
                // @ts-ignore
                start: dec.id.start, end: dec.id.end,
            })
            if(dec.init){
                exprs.push(gen.AssignmentExpression('=', dec.id, dec.init))
            } else if(includeIdentifiers){
                exprs.push(dec.id)
            }
        })
        if(exprs.length == 0){
            return null
        }
        if(exprs.length === 1){
            return exprs[0]
        }
        return gen.SequenceExpression(exprs)
    }

    walk(functionNode, {
        VariableDeclaration: (node: ESTree.VariableDeclaration, parents: Node[], parentKeys: (string|number)[][])=>{
            let expr = varDeclToExpr(node, false)
            let father = parents[parents.length - 1]
            let fatherKey = parentKeys[parents.length - 1]
            if(expr == null) {
                removeChild(father, node, fatherKey)
            }else{
                replaceOrRemoveChild(father, node, fatherKey, gen.ExpressionStatement(expr))
            }
            // skip children walk
            return true
        },
        ForStatement: (node: ESTree.ForStatement, parents: Node[], parentKeys: (string|number)[][]) => {
            if(node.init && node.init.type == 'VariableDeclaration'){
                node.init = varDeclToExpr(node.init, false)
            }
        },
        ForInStatement: (node: ESTree.ForInStatement, parents: Node[], parentKeys: (string|number)[][]) => {
            if(node.left && node.left.type === 'VariableDeclaration'){
                node.left = varDeclToExpr(node.left, true)
            }
        },
        ForOfStatement: (node: ESTree.ForOfStatement, parents: Node[], parentKeys: (string|number)[][]) => {
            if(node.left && node.left.type === 'VariableDeclaration'){
                node.left = varDeclToExpr(node.left, true)
            }
        },
        FunctionDeclaration: (node: ESTree.FunctionDeclaration, parents: Node[], parentKeys: (string|number)[][]) => {
            vars[node.id.name] = node.id
            let assignment = gen.ExpressionStatement(
                gen.AssignmentExpression(
                    '=',
                    gen.clone(node.id),
                    gen.FunctionExpression({
                        id: gen.Identifier({name: node.id.name+uuid()}),
                        body: node.body,
                        params: node.params,
                        generator: node.generator,
                        // @ts-ignore
                        expression: node.expression,
                    })
                )
            );
            let father = parents[parents.length - 1]
            let fatherKey = parentKeys[parents.length - 1]
            if(father.type === 'BlockStatement'){
                // @ts-ignore
                father.body.unshift(assignment)
                removeChild(father, node, fatherKey)
            }else{
                replaceOrRemoveChild(father, node, fatherKey, assignment)
            }

            // skip walk children
            return true
        },
        // skip walk children
        FunctionExpression: () => true,
        ArrowFunctionExpression: () => true,

    });

    let paramNames = {}
    functionNode.params.forEach(param=>{
        if(param.type == 'Identifier'){
            paramNames[param.name] = param
        }
    })

    let declarations = []
    Object.keys(vars).forEach(name=>{
        if(!hasOwn.call(paramNames, name)){
            declarations.push(gen.VariableDeclarator({
                id: vars[name],
                init: null
            }))
        }
    })

    if(declarations.length === 0){
        return null
    }

    return gen.VariableDeclaration('var', declarations)

}



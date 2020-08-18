import {typeKeyMap} from './meta'
import {Node, ESTree} from './types'


export function walk(node:Node, visitors: {
    [key: string]: (n: Node, parents: Node[], parentKeys: (string|number)[][]) => true|void
}, parents:Node[] = [], parentKeys:(string | number)[][] = []){
    if(!node) return
    let func = visitors[node.type]
    let skip = false
    if(func){
        skip = func.call(null, node, parents, parentKeys)
    }
    if(!skip){
        let childKeys = typeKeyMap[node.type]
        childKeys.length && childKeys.forEach(key=>{
            if(node[key]){
                if(Array.isArray(node[key])){
                    node[key].forEach((item, ind)=>{
                        walk(item, visitors, parents.concat([node]), parentKeys.concat([[key, ind]]))
                    })
                }else{
                    walk(node[key], visitors, parents.concat([node]), parentKeys.concat([[key]]))
                }
            }
        })
    }
}

export function walkWithScope(node:Node, visitors: {
    [key: string]: (n: Node, parents: Node[], parentKeys: (string|number)[][]) => true|void
}, parents:Node[] = [], parentKeys:(string | number)[][] = []){
    // 先过一趟，如果遇到ifStatement这样的会产生scope的语句，就在这个node上加一个_rs_scope属性，
    // 然后向下深度优先遍历，如果涉及变量的声明、函数参数的声明、catch参数的申明等等，就在对应_rs_scope上加上变量的key
    // 整体过完一趟，生成了所有的_rs_scope之后，再走第二趟，每个visitor可以根据_rs_scope判断当前作用域中存在的变量（可能会向上寻找：parent[x]._rs_scope，这个逻辑每个Visitor各自处理）
    if(!node['_rs_scope']){
    }

}

const SCOPE_KEY = '_rs_scope'

function injectScope(node:Node, parents, noSkip?: boolean){
    if(node[SCOPE_KEY]){
        if(!noSkip){
            return
        }
    }

    if(node.type === 'BlockStatement'){
        node[SCOPE_KEY] = {}
        node.body.forEach(item=>{
            injectScope(item, parents.concat([node]))
        })
        // todo: do while
    }else if(node.type === 'IfStatement' || node.type == 'WhileStatement'){
        // if/while的test里面是不可能声明变量的
    }else if(node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'ForStatement'){
        // forin循环可能在test生成一个新的scope
        node[SCOPE_KEY] = {}
        intoChild(node, (child, keyArr)=>{
            injectScope(child, parents.concat([node]))
        })
    }else if(node.type === 'FunctionExpression'){
        node[SCOPE_KEY] = {}
        // 获取参数列表，加上arguments和this，注入下级的block的scope中
        let keys = getFuncParam(node)
        keys.push('arguments', 'this')
        keys.forEach(key=>{
            node[SCOPE_KEY][key] = true
        })
        injectScope(node.body, parents.concat([node]))
    }else if(node.type === 'FunctionDeclaration'){
        // FunctionDeclaration除了有FunctionExpression属性，同时也声明的一个变量
        node[SCOPE_KEY] = {}
        // 向上级scope声明这个函数变量，一个函数的声明等于是var
        injectKeyToScope(parents, node.id.name, 'var')

        let keys = getFuncParam(node)
        keys.push('arguments', 'this')
        keys.forEach(key=>{
            node[SCOPE_KEY][key] = true
        })
        injectScope(node.body, parents.concat([node]))
    }else if(node.type === 'ArrowFunctionExpression'){
        node[SCOPE_KEY] = {}
    }else if(node.type === 'TryStatement'){

    }
}

function injectKeyToScope(parents, key, kind){

}

function getFuncParam(node: ESTree.FunctionExpression | ESTree.FunctionDeclaration){
    let keys = []
    node.params.forEach(item=>{
        if(item.type === 'Identifier'){
            keys.push(item.name)
        }else if(item.type === 'RestElement'){
            // @ts-ignore
            keys.push(item.argument.name)
        }else if(item.type === 'ArrayPattern'){
            keys = keys.concat(item.elements.map(_=>{
                if(_.type == 'Identifier'){
                    return _.name
                }else if(_.type == 'RestElement'){
                    // @ts-ignore
                    return _.argument.name
                }
            }));
        }else if(item.type === 'AssignmentPattern'){
            // @ts-ignore
            keys.push(item.left.name)
        }else if(item.type === 'ObjectPattern'){
            keys = keys.concat(item.properties.map(_=>{
                if(_.type == 'Property'){
                    // @ts-ignore
                    return _.key.name
                }else if(_.type == 'RestElement'){
                    // @ts-ignore
                    return _.argument.name
                }
            }))
        }
    })
    return keys.filter(_=>_!=null)
}

function intoChild(node, cb){
    let childKeys = typeKeyMap[node.type]
    childKeys.length && childKeys.forEach(key=>{
        if(node[key]){
            if(Array.isArray(node[key])){
                node[key].forEach((item, ind)=>{
                    cb(item, [key, ind])
                })
            }else{
                cb(node[key], [key])
            }
        }
    })
}

function _walkWithScope(node:Node, visitors: {
    [key: string]: (n: Node, parents: Node[], parentKeys: (string|number)[][]) => true|void
}, parents:Node[] = [], parentKeys:(string | number)[][] = []){

}
import {typeKeyMap} from './meta'
import {Node, ESTree} from './types'


export function walk(node:Node, visitors: {
    [key: string]: (n: Node, parents: Node[], parentKeys: (string|number)[][]) => true|void
}, parents:Node[] = [], parentKeys:(string | number)[][] = []){
    if(!node) return
    let func = visitors[node.type]
    if(!func && visitors.All){
        func = visitors.All
    }
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
    injectScope(node, [])
    // 整体过完一趟，生成了所有的_rs_scope之后，再走第二趟，每个visitor可以根据_rs_scope判断当前作用域中存在的变量（可能会向上寻找：parent[x]._rs_scope，这个逻辑每个Visitor各自处理）
    walk(node, visitors, parents, parentKeys)
}

export const SCOPE_KEY = '_rs_scope'

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
    }else if(node.type === 'DoWhileStatement'){
        injectScope(node.body, parents.concat([node]))
    } else if(node.type === 'IfStatement' || node.type == 'WhileStatement'){
        // if/while的test里面是不可能声明变量的
        intoChild(node, (child, keyArr)=>{
            injectScope(child, parents.concat([node]))
        })
    }else if(node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'ForStatement'){
        // forin循环可能在test生成一个新的scope
        node[SCOPE_KEY] = {}
        intoChild(node, (child, keyArr)=>{
            injectScope(child, parents.concat([node]))
        })
    }else if(node.type === 'FunctionExpression'){
        node[SCOPE_KEY] = {}
        // 获取参数列表，加上arguments和this，注入下级的block的scope中
        let keys = getFuncParam(node.params)
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

        let keys = getFuncParam(node.params)
        keys.push('arguments', 'this')
        keys.forEach(key=>{
            node[SCOPE_KEY][key] = true
        })
        injectScope(node.body, parents.concat([node]))
    }else if(node.type === 'ArrowFunctionExpression'){
        node[SCOPE_KEY] = {}
        let keys = getFuncParam(node.params)
        // 箭头函数没有arguments
        keys.push('this')
        keys.forEach(key=>{
            node[SCOPE_KEY][key] = true
        })
        injectScope(node.body, parents.concat([node]))
    }else if(node.type === 'TryStatement'){
        // 只有catch的时候会捕获一个新的变量e，下一级处理即可
        intoChild(node, (child, keyArr)=>{
            injectScope(child, parents.concat([node]))
        })
    }else if(node.type === 'CatchClause'){
        node[SCOPE_KEY] = {}
        let keys = getFuncParam([node.param])
        keys.forEach(key=>{
            node[SCOPE_KEY][key] = true
        })
        injectScope(node.body, parents.concat([node]))
    }else if(node.type === 'VariableDeclaration'){
        let keys = getFuncParam(node.declarations.map(_=>_.id))
        injectKeyToScope(parents, keys, node.kind)
        intoChild(node, (child)=>{
            injectScope(child, parents.concat([node]))
        })
    }else{
        // 其他类型的节点，向下即可
        intoChild(node, (child)=>{
            injectScope(child, parents.concat([node]))
        })
    }
}

function injectKeyToScope(parents:Node[], key: string|string[], kind: 'var' | 'let' | 'const'){
    for(let p=parents.length-1; p>=0; p--){
        if(parents[p][SCOPE_KEY]){
            if(kind !== 'var'){
                if(Array.isArray(key)){
                    key.forEach(k=>{
                        parents[p][SCOPE_KEY][k] = true
                    })
                }else{
                    parents[p][SCOPE_KEY][key] = true
                }
                return;
            }else{
                if(parents[p].type == 'FunctionDeclaration' || parents[p].type == 'FunctionExpression' || parents[p].type == 'ArrowFunctionExpression'){
                    if(Array.isArray(key)){
                        key.forEach(k=>{
                            ;(parents[p] as ESTree.FunctionExpression).body[SCOPE_KEY][k] = true
                        })
                    }else{
                        ;(parents[p] as ESTree.FunctionExpression).body[SCOPE_KEY][key] = true
                    }
                    return;
                }
            }
        }
    }
    // 没找到？按理说不会发生，直接不标记忽略即可
}

function getFuncParam(params: ESTree.Pattern[] ){
    let keys = []
    params.forEach(item=>{
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
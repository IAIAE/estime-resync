import {typeKeyMap} from './meta'

export function walk(node, visitors, parents = [], parentKeys = []){
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
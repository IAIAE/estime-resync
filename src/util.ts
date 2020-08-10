import {Node, ESTree} from './types'
import {typeKeyMap} from './meta'

/**
 * 将child节点删除
 * @param father
 * @param child */
export function removeChild(father: Node, child: any, fatherKey: (string|number)[]){
    if(fatherKey.length == 1){
        father[fatherKey[0]] = null
    }else if(fatherKey.length == 2){
        father[fatherKey[0]][fatherKey[1]] = null
    }
}

export function replaceOrRemoveChild(father: Node, child: any, fatherKey: (string|number)[], newChild?:any){
    if(fatherKey.length == 1){
        father[fatherKey[0]] = newChild
    }else if(fatherKey.length == 2){
        father[fatherKey[0]][fatherKey[1]] = newChild
    }
}
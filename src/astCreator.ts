import {ESTree, Node} from './types'

export function Identifier(option: {
    start?: number
    end?: number
    name: string
}){
    return {
        type: 'Identifier',
        start: option.start,
        end: option.end,
        name: option.name,
    }
}

export function VariableDeclarator(option: {
    start?: number
    end?: number
    id: ESTree.Identifier,
    init: Node
}){
    return {
        type: 'VariableDeclarator',
        start: option.start,
        end: option.end,
        id: option.id,
        init: option.init,
    }
}
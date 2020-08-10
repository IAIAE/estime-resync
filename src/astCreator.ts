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

export function VariableDeclaration(kind, declarations){
    return {
        type: 'VariableDeclaration',
        kind,
        declarations,
    }
}

export function AssignmentExpression(operator, left, right, option?){
    option = option || {}
    return {
        type: "AssignmentExpression",
        start: option.start,
        end: option.end,
        operator,
        left, right,
    }
}

export function SequenceExpression(arr: ESTree.Expression[]){
    return {
        type: 'SequenceExpression',
        expressions: arr,
    }
}

export function ExpressionStatement(child){
    return {
        type: 'ExpressionStatement',
        expression: child,
    }
}

export function FunctionExpression(option: {
    id: any,
    expression?: boolean
    generator?: boolean
    async?: boolean
    params: any
    body: any
}){
    return  {
        type: 'FunctionExpression',
        id: option.id,
        expression: option.expression || false,
        generator:  option.generator || false,
        async:  option.async || false,
        params: option.params,
        body: option.body,
    }
}

export function clone(node){
    return JSON.parse(JSON.stringify(node))
}

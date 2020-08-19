import {ESTree, Node} from './types'

export function Identifier(option: {
    name: string
}):ESTree.Identifier{
    return {
        type: 'Identifier',
        name: option.name,
    }
}

export function VariableDeclarator(option: {
    id: any,
    init: any
}){
    return {
        type: 'VariableDeclarator',
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
export function Literal(val): ESTree.Literal{
    return {
        "type": "Literal",
        "value": val,
        "raw": JSON.stringify(val),
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

export function SwitchStatement(test, cases){
    return {
        "type": "SwitchStatement",
        "discriminant": test,
        "cases": cases
    }
}

export function SwitchCase(test, consequent){
    return {
        "type": "SwitchCase",
        consequent,
        test,
    }
}

export function clone(node){
    return JSON.parse(JSON.stringify(node))
}

export function WhileStatement(test, body){
    return {
        "type": "WhileStatement",
        test,
        body,
    }
}

export function ArrayExpression(elements){
    return {
        "type": "ArrayExpression",
        elements
    }
}

export function YieldExpression(delegate: boolean, argument){
    return {
        type: 'YieldExpression',
        delegate,
        argument,
    }
}

export function BreakStatement(label?) {
    return {
        type: 'BreakStatement',
        label: label || null,
    }
}

export function ConditionalExpression(test, consequent, alternate){
    return {
        "type": "ConditionalExpression",
        "test": test,
        "consequent": consequent,
        "alternate": alternate,
    }
}

export function IfStatement(test, consequent, alternate?){
    return {
        "type": "IfStatement",
        "test": test,
        "consequent": consequent,
        "alternate": alternate,
    }
}

export function BinaryExpression(op, left, right){
    return {
        "type": "BinaryExpression",
        "left": left,
        "operator": op,
        "right": right,
    }
}
export function MemberExpression(varName, key, computed){
    return {
        "type": "MemberExpression",
        "object": {
            "type": "Identifier",
            "name": varName
        },
        "property": {
            "type": "Identifier",
            "name": key
        },
        computed,
    }
}

export function ThrowStatement(arg){
    return {
        type: 'ThrowStatement',
        argument: arg
    }
}

export function UnaryExpression(operator, argument){
    return {
        "type": "UnaryExpression",
        "operator": operator,
        "prefix": true,
        "argument": argument
    }
}

export function CallExpression(callee, args){
    return {
        type: 'CallExpression',
        callee,
        arguments: args
    }
}

export function ReturnStatement(args){
    return {
        type: 'ReturnStatement',
        argument: args,
    }
}

export function BlockStatement(body:any[]){
    return {
        type: 'BlockStatement',
        body,
    }
}
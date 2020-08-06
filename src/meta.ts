import { Node } from './types'
import { NODE_UID_KEY } from './config'
import { uuid } from './uid'

const mMap = {}

function m(node: Node) {
    let nodeid: string;
    // @ts-ignore
    if (!node[NODE_UID_KEY]) {
        node[NODE_UID_KEY] = uuid()
    }
    nodeid = node[NODE_UID_KEY]

    if (!mMap[nodeid]) {
        mMap[nodeid] = {}
    }
    return mMap[nodeid]
}


const hasOwn = Object.prototype.hasOwnProperty;

function makePredicate(propertyName: string, knownTypes: { [key: string]: boolean }) {
    function onlyChildren(node: Node ) {
        let result = false;
        function check(child: Node | Node[]) {
            if (result || child == null) {
                return result
            } else if (Array.isArray(child)) {
                child.some(check)
            } else {
                result = predicate(child)
            }
            return result
        }

        let childKeys: string[] = getChildKeys(node)
        if (childKeys && childKeys.length) {
            for (let i = 0; i < childKeys.length; i++) {
                let key = childKeys[i]
                let child = node[key]
                check(child)
            }
        }
        return result
    }

    function predicate(node: Node) {
        let meta = m(node)
        if (hasOwn.call(meta, propertyName)) {
            return meta[propertyName]
        }
        if (hasOwn.call(opaqueTypes, node.type)) {
            return meta[propertyName] = false
        }
        if (hasOwn.call(knownTypes, node.type)) {
            return meta[propertyName] = true
        }
        return meta[propertyName] = onlyChildren(node)
    }
    predicate.onlyChildren = onlyChildren
    return predicate
}


let opaqueTypes = {
    FunctionExpression: true,
    ArrowFunctionExpression: true
};

// These types potentially have side effects regardless of what side
// effects their subexpressions have.
let sideEffectTypes = {
    CallExpression: true, // Anything could happen!
    ForInStatement: true, // Modifies the key variable.
    UnaryExpression: true, // Think delete.
    BinaryExpression: true, // Might invoke .toString() or .valueOf().
    AssignmentExpression: true, // Side-effecting by definition.
    UpdateExpression: true, // Updates are essentially assignments.
    NewExpression: true // Similar to CallExpression.
};

// These types are the direct cause of all leaps in control flow.
let leapTypes = {
    YieldExpression: true,
    BreakStatement: true,
    ContinueStatement: true,
    ReturnStatement: true,
    ThrowStatement: true
};

/**
 * 获取estree节点的子节点的key
 * @param node
 */
function getChildKeys(node: Node) {
    return typeKeyMap[node.type] || []
}

export const hasSideEffects = makePredicate('hasSideEffects', sideEffectTypes)
export const containsLeap = makePredicate('containsLeap', leapTypes)


let typeKeyMap = {
    ArrayExpression: ['elements'],
    AssignmentExpression: ['left', 'right'],
    BinaryExpression: ['left', 'right'],
    InterpreterDirective: [],
    Directive: ['value'],
    DirectiveLiteral: [],
    BlockStatement: ['directives', 'body'],
    BreakStatement: ['label'],
    CallExpression: ['callee', 'arguments', 'typeParameters', 'typeArguments'],
    CatchClause: ['param', 'body'],
    ConditionalExpression: ['test', 'consequent', 'alternate'],
    ContinueStatement: ['label'],
    DebuggerStatement: [],
    DoWhileStatement: ['test', 'body'],
    EmptyStatement: [],
    ExpressionStatement: ['expression'],
    File: ['program'],
    ForInStatement: ['left', 'right', 'body'],
    ForStatement: ['init', 'test', 'update', 'body'],
    FunctionDeclaration: ['id', 'params', 'body', 'returnType', 'typeParameters'],
    FunctionExpression: ['id', 'params', 'body', 'returnType', 'typeParameters'],
    Identifier: ['typeAnnotation', 'decorators'],
    IfStatement: ['test', 'consequent', 'alternate'],
    LabeledStatement: ['label', 'body'],
    StringLiteral: [],
    NumericLiteral: [],
    NullLiteral: [],
    BooleanLiteral: [],
    RegExpLiteral: [],
    LogicalExpression: ['left', 'right'],
    MemberExpression: ['object', 'property'],
    NewExpression: ['callee', 'arguments', 'typeParameters', 'typeArguments'],
    Program: ['directives', 'body'],
    ObjectExpression: ['properties'],
    ObjectProperty: ['key', 'value', 'decorators'],
    RestElement: ['argument', 'typeAnnotation'],
    ReturnStatement: ['argument'],
    SequenceExpression: ['expressions'],
    ParenthesizedExpression: ['expression'],
    SwitchCase: ['test', 'consequent'],
    SwitchStatement: ['discriminant', 'cases'],
    ThisExpression: [],
    ThrowStatement: ['argument'],
    TryStatement: ['block', 'handler', 'finalizer'],
    UnaryExpression: ['argument'],
    UpdateExpression: ['argument'],
    VariableDeclaration: ['declarations'],
    VariableDeclarator: ['id', 'init'],
    WhileStatement: ['test', 'body'],
    WithStatement: ['object', 'body'],
    AssignmentPattern: ['left', 'right', 'decorators'],
    ArrayPattern: ['elements', 'typeAnnotation'],
    ArrowFunctionExpression: ['params', 'body', 'returnType', 'typeParameters'],
    ClassBody: ['body'],
    ClassExpression: ['id', 'body', 'superClass', 'mixins', 'typeParameters', 'superTypeParameters', 'implements', 'decorators'],
    ClassDeclaration: ['id', 'body', 'superClass', 'mixins', 'typeParameters', 'superTypeParameters', 'implements', 'decorators'],
    ExportAllDeclaration: ['source'],
    ExportDefaultDeclaration: ['declaration'],
    ExportNamedDeclaration: ['declaration', 'specifiers', 'source'],
    ExportSpecifier: ['local', 'exported'],
    ForOfStatement: ['left', 'right', 'body'],
    MetaProperty: ['meta', 'property'],
    ClassMethod: ['key', 'params', 'body', 'decorators', 'returnType', 'typeParameters'],
    ObjectPattern: ['properties', 'typeAnnotation', 'decorators'],
    SpreadElement: ['argument'],
    Super: [],
    TaggedTemplateExpression: ['tag', 'quasi'],
    TemplateElement: [],
    TemplateLiteral: ['quasis', 'expressions'],
    YieldExpression: ['argument'],

    JSXAttribute: ['name', 'value'],
    JSXClosingElement: ['name'],
    JSXElement: ['openingElement', 'children', 'closingElement'],
    JSXEmptyExpression: [],
    JSXExpressionContainer: ['expression'],
    JSXSpreadChild: ['expression'],
    JSXIdentifier: [],
    JSXMemberExpression: ['object', 'property'],
    JSXNamespacedName: ['namespace', 'name'],
    JSXOpeningElement: ['name', 'attributes'],
    JSXSpreadAttribute: ['argument'],
    JSXText: [],
    JSXFragment: ['openingFragment', 'children', 'closingFragment'],
    JSXOpeningFragment: [],
    JSXClosingFragment: [],
    AwaitExpression: ['argument'],
    BindExpression: ['object', 'callee'],
    ClassProperty: ['key', 'value', 'typeAnnotation', 'decorators'],
    OptionalMemberExpression: ['object', 'property'],
    OptionalCallExpression: ['callee', 'arguments', 'typeParameters', 'typeArguments'],
    ClassPrivateProperty: ['key', 'value', 'decorators'],
    ClassPrivateMethod: ['key', 'params', 'body', 'decorators', 'returnType', 'typeParameters'],
}
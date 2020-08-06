import {ESTree, Node} from './types'
import walk from 'acorn-walk'
let hasOwn = Object.prototype.hasOwnProperty;
import * as gen from './astCreator'

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

    walk.ancestor(functionNode, {
        VariableDeclaration: (node: ESTree.VariableDeclaration, parents)=>{
            let expr = varDeclToExpr(node, false)
            if(expr == null) {

            }
        }
    })
}
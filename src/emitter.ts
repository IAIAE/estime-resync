import {Node, ESTree } from "./types";
import { LeapManager, TryEntry, LabeledEntry, LoopEntry} from "./leap";
import * as gen from './astCreator'
import * as meta from './meta'
import { ForStatement } from "estree";
import * as util from './util'

export default class Emitter {
    nextTempId: number
    listing: any[]
    marked: any[]
    contextId: ESTree.Identifier
    insertedLocs: any[]
    finalLoc: ESTree.Literal
    tryEntries: TryEntry[]
    leapManager: LeapManager

    constructor(contextId: ESTree.Identifier){
        this.nextTempId = 0
        this.contextId = contextId
        this.listing = []
        this.marked = [true]
        this.insertedLocs = []
        this.finalLoc = this.loc()
        this.tryEntries = []
        this.leapManager = new LeapManager(this)
    }

    loc(){
        const l = gen.Literal(-1)
        this.insertedLocs.push(l)
        return l;
    }
    getInsertedLocs(){
        return this.insertedLocs
    }
    getContextId(){
        return gen.clone(this.contextId)
    }
    mark(loc:ESTree.Literal){
        let index = this.listing.length
        if(loc.value === -1){
            loc.value = index
        }else{
            // loc.value === index
        }
        this.marked[index] = true
        return loc
    }
    emit(node){
        this.listing.push(node)
    }
    emitAssign(left, right){
        this.emit(this.assign(left, right))
        return left
    }
    assign(left, right){
        return gen.ExpressionStatement(gen.AssignmentExpression('=', gen.clone(left), right))
    }
    contextProperty(name:string, computed?: boolean){
        return gen.MemberExpression(this.getContextId(), name, !!computed)
    }
    stop(rval){
        if(rval){
            this.setReturnValue(rval)
        }
        this.jump(this.finalLoc)
    }
    setReturnValue(valueNode){
        this.emitAssign(
            this.contextProperty('rval'),
            this.explodeExpression(valueNode),
        )
    }
    clearPendingException(tryLoc, assignee){
        let catchCall = gen.CallExpression(
            this.contextProperty('catch', true),
            [gen.clone(tryLoc)]
        );

        if(assignee){
            this.emitAssign(assignee, catchCall)
        }else{
            this.emit(catchCall)
        }
    }
    jump(toLoc: ESTree.Literal){
        this.emitAssign(this.contextProperty('next'), toLoc)
        this.emit(gen.BreakStatement())
    }
    jumpIf(test, toLoc){
        this.emit(gen.IfStatement(
            test,
            gen.BlockStatement([
                this.assign(this.contextProperty('next'), toLoc),
                gen.BreakStatement(),
            ])
        ))
    }
    jumpIfNot(test: Node, toLoc){
        let negatedTest;
        if(test.type == 'UnaryExpression' && test.operator === '!'){
            negatedTest = test.argument
        }else {
            negatedTest = gen.UnaryExpression('!', test)
        }
        this.emit(gen.IfStatement(
            negatedTest,
            gen.BlockStatement([
                this.assign(this.contextProperty('next'), toLoc),
                gen.BreakStatement(),
            ])
        ))
    }
    makeTempVar(){
        return this.contextProperty('t'+this.nextTempId++)
    }

    getContextFunction(id?: ESTree.Identifier){
        return gen.FunctionExpression({
            id: id|| null,
            params: [this.getContextId()],
            body: gen.BlockStatement([this.getDispatchLoop()]),
            generator: false,
            expression: false,
            async: false,
        })
    }

    getDispatchLoop(){
        // switch的case列表
        let cases = []
        // 当前case中需要执行的statement列表
        let current;
        let alreadyEnded = false;
        this.listing.forEach((stmt, i)=>{
            if(this.marked.hasOwnProperty(i)){
                cases.push(gen.SwitchCase(gen.Literal(i), current = []))
                alreadyEnded = false
            }
            if(!alreadyEnded){
                current.push(stmt);
                if(stmt.type == 'BreakStatement' || stmt.type == 'ReturnStatement' || stmt.type == 'ContinueStatement' || stmt.type == 'ThrowStatement'){
                    alreadyEnded = true
                }
            }
        });

        this.finalLoc.value = this.listing.length
        cases.push(
            gen.SwitchCase(this.finalLoc, []),
            gen.SwitchCase(gen.Literal('end'), [
                gen.ReturnStatement(gen.CallExpression(this.contextProperty('stop'), []))
            ])
        );

        return gen.WhileStatement(
            gen.Literal(1),
            gen.SwitchStatement(
                gen.AssignmentExpression(
                    '=',
                    this.contextProperty('prev'),
                    this.contextProperty('next')
                ),
                cases,
            )
        );
    }

    getTryLocsList(){
        if(this.tryEntries.length == 0){
            return null
        }
        let lastLocValue:any = 0
        return gen.ArrayExpression(
            this.tryEntries.map((tryEntry)=>{
                let thisLocValue = tryEntry.firstLoc.value;
                lastLocValue = thisLocValue
                let ce = tryEntry.catchEntry
                let fe = tryEntry.finallyEntry

                let locs = [tryEntry.firstLoc, ce?ce.firstLoc: null]
                if(fe){
                    locs[2] = fe.firstLoc
                    locs[3] = fe.afterLoc
                }
                return gen.ArrayExpression(locs.map(loc=>loc && gen.clone(loc)))
            })
        )
    }

    explode(node: Node, ignoreResult?: boolean){
        if(/Declaration/.test(node.type)){
            throw  getDeclError(node)
        }
        if(/Statement/.test(node.type)){
            return this.explodeStatement(node)
        }
        if(/Expression/.test(node.type)){
            return this.explodeExpression(node, ignoreResult)
        }

        switch(node.type){
            case 'Program':
                return node.body.map(stmt=>this.explodeStatement(stmt))
            case 'VariableDeclarator':
                throw new Error('resync cannot explode a VariableDeclarator node  =>'+JSON.stringify(node.id))
            case "Property":
            case "SwitchCase":
            case "CatchClause":
                throw new Error( node.type + " nodes should be handled by their parents");
            default:
                throw new Error( "unknown Node of type " + JSON.stringify(node.type));
        }

    }
    explodeStatement(node: Node, labelId?: ESTree.Identifier){
        let stmt = node
        let before, after, head;
        labelId = labelId || null
        if(stmt.type == 'BlockStatement'){
            stmt.body.forEach(item=>{
                this.explodeStatement(item)
            })
            return;
        }

        if(!meta.containsLeap(stmt)){
            this.emit(stmt)
            return;
        }
        switch(stmt.type){
            case 'ExpressionStatement':
                this.explodeExpression(stmt.expression, true)
                break
            case 'LabeledStatement':
                after = this.loc()
                this.leapManager.withEntry(
                    new LabeledEntry(after, stmt.label),
                    ()=>{
                        this.explodeStatement((stmt as ESTree.LabeledStatement).body, (stmt as ESTree.LabeledStatement).label)
                    }
                )
                this.mark(after)
                break
            case 'WhileStatement':
                before = this.loc()
                after = this.loc()
                this.mark(before)
                this.jumpIfNot(this.explodeExpression(stmt.test), after)
                this.leapManager.withEntry(
                    new LoopEntry(after, before, labelId),
                    ()=>{this.explodeStatement((stmt as ESTree.WhileStatement).body)}
                )
                this.jump(before)
                this.mark(after)
            case 'DoWhileStatement':
                let first = this.loc()
                let test = this.loc()
                after = this.loc()

                this.mark(first)
                this.leapManager.withEntry(
                    new LoopEntry(after, test, labelId),
                    ()=>{ this.explode((stmt as ESTree.DoWhileStatement).body) }
                )
                this.mark(test)
                this.jumpIf(this.explodeExpression((stmt as ESTree.DoWhileStatement).test), first)
                this.mark(after)
                break;
            case 'ForStatement':
                head = this.loc()
                let update = this.loc()
                after = this.loc()
                if(stmt.init){
                    this.explode(stmt.init, true)
                }
                this.mark(head)
                if(stmt.test){
                    this.jumpIfNot(this.explodeExpression(stmt.test), after)
                }else {
                    // no test means continue anywise
                }
                this.leapManager.withEntry(
                    new LoopEntry(after, update, labelId),
                    ()=>{this.explodeStatement((stmt as ESTree.ForStatement).body)}
                )
                this.mark(update)
                if(stmt.update){
                    this.explode(stmt.update, true)
                }
                this.jump(head)
                this.mark(after)
                break
            case 'ForInStatement':
                head = this.loc()
                after = this.loc()
                let keyInterNextFn = this.makeTempVar()
                this.emitAssign(
                    keyInterNextFn,
                    gen.CallExpression(
                        util.runtimeProperty('keys'),
                        [this.explodeExpression(stmt.right)]
                    )
                );
                this.mark(head)
                let keyInfoTmpVar = this.makeTempVar()
                this.jumpIf(
                    gen.MemberExpression(
                        gen.AssignmentExpression(
                            '=',
                            keyInfoTmpVar,
                            gen.CallExpression(gen.clone(keyInterNextFn), [])
                        ),
                        gen.Identifier({name: 'done'}),
                        false,
                    ),
                    after
                );
                this.emitAssign(
                    stmt.left,
                    gen.MemberExpression(
                        gen.clone(keyInfoTmpVar),
                        gen.Identifier({name: 'value'}),
                        false,
                    )
                );

                this.leapManager.withEntry(
                    new LoopEntry(after, head, labelId),
                    ()=>{this.explodeStatement((stmt as ESTree.ForInStatement).body)}
                )

                this.jump(head)
                this.mark(after)
                break
            case 'BreakStatement':
                this.emit
        }
    }

    explodeExpression(node: ESTree.Expression, ignoreResult?: boolean): Node {
        // todo:
        return node;
    }

}

function getDeclError(node) {
    return new Error(
      "all declarations should have been transformed into " +
      "assignments before the Exploder began its work: " +
      JSON.stringify(node));
}
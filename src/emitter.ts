import {Node, ESTree } from "./types";
import { LeapManager, TryEntry, LabeledEntry, LoopEntry, SwitchEntry, CatchEntry, FinallyEntry} from "./leap";
import * as gen from './astCreator'
import * as meta from './meta'
import { ForStatement } from "estree";
import * as util from './util'
import { walk, SCOPE_KEY, walkWithScope } from "./astHelper";

const hasOwn = Object.prototype.hasOwnProperty

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
    jump(toLoc:ESTree.Literal){
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

        // 如果不包含跳转，该statement直接emit到结果集中
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
                this.emitAbruptCompletion({
                    type: 'break',
                    target: this.leapManager.getBreakLoc(stmt.label)
                })
                break;
            case 'ContinueStatement':
                this.emitAbruptCompletion({
                    type: 'continue',
                    target: this.leapManager.getContinueLoc(stmt.label)
                })
                break;
            case 'SwitchStatement':
                let disc = this.emitAssign(
                    this.makeTempVar(),
                    this.explodeExpression(stmt.discriminant)
                )

                after = this.loc()
                let defaultLoc = this.loc()
                let condition:any = defaultLoc
                let caseLocs = []
                let cases = stmt.cases || []
                for(let i= cases.length-1; i>=0; --i){
                    let c = cases[i]
                    if(c.test){
                        condition = gen.ConditionalExpression(
                            gen.BinaryExpression('===', gen.clone(disc), c.test),
                            caseLocs[i] = this.loc(),
                            condition,
                        )
                    }else{
                        caseLocs[i] = defaultLoc
                    }
                }
                let discriminant = stmt.discriminant;
                stmt.discriminant = condition
                this.jump(this.explodeExpression(discriminant))

                this.leapManager.withEntry(
                    new SwitchEntry(after),
                    ()=>{
                        stmt = stmt as ESTree.SwitchStatement;
                        stmt.cases.forEach((item, i)=>{
                            this.mark(caseLocs[i])
                            item.consequent.forEach(node=>{
                                this.explodeStatement(node)
                            })
                        })
                    }
                )
                this.mark(after)
                if(defaultLoc.value === -1){
                    this.mark(defaultLoc)
                }
                break;

            case 'IfStatement':

                let elseLoc = stmt.alternate && this.loc();
                after = this.loc()
                this.jumpIfNot(
                    this.explodeExpression(stmt.test),
                    elseLoc || after,
                )
                this.explodeStatement(stmt.consequent)
                if(elseLoc){
                    this.jump(after)
                    this.mark(elseLoc)
                    this.explodeStatement(stmt.alternate)
                }
                this.mark(after)
                break
            case 'ReturnStatement':
                this.emitAbruptCompletion({
                    type: 'return',
                    value: this.explodeExpression(stmt.argument),
                })
                break;
            case 'WithStatement':
                throw new Error('with statement nor support in generator functions')
            case 'TryStatement':
                after = this.loc()
                let handler = stmt.handler
                let catchLoc = handler && this.loc()
                let catchEntry = catchLoc && new CatchEntry(catchLoc, handler.param)

                let finallyLoc = stmt.finalizer && this.loc()
                let finallyEntry = finallyLoc && new FinallyEntry(finallyLoc, after)
                let tryEntry = new TryEntry(
                    this.getUnmarkedCurrentLoc(),
                    catchEntry,
                    finallyEntry,
                );
                this.tryEntries.push(tryEntry)
                this.updateContextPrevLoc(tryEntry.firstLoc)
                this.leapManager.withEntry(tryEntry, ()=>{
                    this.explodeStatement((stmt as ESTree.TryStatement).block)
                    if(catchLoc){
                        if(finallyLoc){
                            this.jump(finallyLoc)
                        }else{
                            this.jump(after)
                        }
                        this.updateContextPrevLoc(this.mark(catchLoc))
                        let body = (stmt as ESTree.TryStatement).handler.body
                        let safeParam = this.makeTempVar()
                        this.clearPendingException(tryEntry.firstLoc, safeParam)

                        // catch会bind一个err变量: catch(err){....}，需要替换catch下级的对该变量的访问
                        walkWithScope(body, {
                            Identifier: (node: ESTree.Identifier, parents, parentKeys)=>{
                                // 按理说这个变量作为右值有使用才需要替换，这里统一替换不判断是否引用
                                if(node.name === (handler.param as ESTree.Identifier).name && true){
                                    let father = parents[parents.length - 1]
                                    let fatherKey = parentKeys[parents.length - 1]
                                    util.replaceOrRemoveChild(father, node, fatherKey, gen.clone(safeParam))
                                }
                            },
                            // 如果作用域内有声明的同名的变量，不要去替换（也就不向下遍历了）
                            All: (node: Node)=>{
                                if(node[SCOPE_KEY] && node[SCOPE_KEY][(handler.param as ESTree.Identifier).name]){
                                    return true
                                }
                            }
                        })
                        this.leapManager.withEntry(catchEntry, ()=>{
                            this.explodeStatement(body);
                        })

                    }

                    if(finallyLoc){
                        this.updateContextPrevLoc(this.mark(finallyLoc))
                        this.leapManager.withEntry(finallyEntry, ()=>{
                            this.explodeStatement((stmt as ESTree.TryStatement).finalizer)
                        })
                        this.emit(gen.ReturnStatement(gen.CallExpression(
                            this.contextProperty('finish'),
                            [finallyEntry.firstLoc],
                        )));
                    }
                })
                this.mark(after);
                break;
            case 'ThrowStatement':
                this.emit(gen.ThrowStatement(
                    this.explodeExpression(stmt.argument)
                ))
                break;
            default:
                throw new Error('unknown Statement of type ' + JSON.stringify(stmt.type))
        }
    }
    updateContextPrevLoc(loc?: ESTree.Literal){
        if(loc){
            if(loc.value === -1){
                loc.value = this.listing.length
            }else{
                // loc.value === this.listing.length
            }
        }else{
            loc = this.getUnmarkedCurrentLoc()
        }

        this.emitAssign(this.contextProperty('prev'), loc)
    }
    getUnmarkedCurrentLoc(){
        return gen.Literal(this.listing.length)
    }

    /**
     * emit ==> _context.abrupt('return', record.(value|target))
     * @param record
     */
    emitAbruptCompletion(record: {type: string, target?: ESTree.Literal, value?:any}){
        if(!isValidCompletion(record)){
            throw new Error('invalid completion record: '+JSON.stringify(record))
        }
        let abruptArgs = [gen.Literal(record.type)]
        if(record.type === 'break' || record.type === 'continue') {
            abruptArgs[1] = this.insertedLocsHas(record.target)?record.target:gen.clone(record.target)
        } else if(record.type == 'return' || record.type == 'throw'){
            if(record.value){
                abruptArgs[1] = this.insertedLocsHas(record.value)?record.value:gen.clone(record.value)
            }
        }

        this.emit(
            gen.ReturnStatement(
                gen.CallExpression(
                    this.contextProperty('abrupt'),
                    abruptArgs
                )
            )
        );
    }

    insertedLocsHas(some){
        return this.insertedLocs.some(_=>_===some)
    }

    explodeExpression(node: Node, ignoreResult?: boolean): ESTree.Literal {
        // todo:
        return;
    }



}

function isValidCompletion(record: {type: string, target?: ESTree.Literal}){
    let type = record.type
    if(type == 'normal'){
        return !hasOwn.call(record, 'target')
    }
    if(type == 'break' || type == 'continue'){
        return !hasOwn.call(record, 'value') && record.target.type === 'Literal'
    }

    if(type == 'return' || type == 'throw'){
        return hasOwn.call(record, 'value') && !hasOwn.call(record, 'target')
    }

    return false
}

function getDeclError(node) {
    return new Error(
      "all declarations should have been transformed into " +
      "assignments before the Exploder began its work: " +
      JSON.stringify(node));
}
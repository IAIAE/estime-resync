import {ESTree} from './types'
import Emitter from './emitter'

class Entry { }

export class FunctionEntry extends Entry {
    returnLoc: ESTree.Literal

    constructor(returnLoc: ESTree.Literal) {
        super()
        this.returnLoc = returnLoc
    }
}

export class LoopEntry extends Entry {
    breakLoc: ESTree.Literal
    continueLoc: ESTree.Literal
    label: ESTree.Identifier

    constructor(breakLoc:ESTree.Literal, continueLoc:ESTree.Literal, label?:ESTree.Identifier){
        super()
        this.breakLoc = breakLoc
        this.continueLoc = continueLoc
        this.label = label
    }
}

export class SwitchEntry extends Entry {
    breakLoc: ESTree.Literal
    constructor(breakLoc: ESTree.Literal){
        super()
        this.breakLoc = breakLoc
    }
}

export class TryEntry extends Entry{
    firstLoc: ESTree.Literal
    catchEntry: CatchEntry
    finallyEntry: FinallyEntry
    constructor(firstLoc: ESTree.Literal, catchEntry: CatchEntry, finallyEntry: FinallyEntry){
        super()
        this.firstLoc = firstLoc
        this.catchEntry = catchEntry
        this.finallyEntry = finallyEntry
    }
}

export class CatchEntry extends Entry{
    firstLoc: ESTree.Literal
    paramId: ESTree.Identifier
    constructor(firstLoc: ESTree.Literal, paramId: ESTree.Identifier){
        super()
        this.firstLoc = firstLoc
        this.paramId = paramId
    }
}

export class FinallyEntry extends Entry {
    firstLoc: ESTree.Literal
    afterLoc: ESTree.Literal
    constructor(firstLoc: ESTree.Literal, afterLoc: ESTree.Literal){
        super()
        this.firstLoc = firstLoc
        this.afterLoc = afterLoc
    }
}

export class LabeledEntry extends Entry {
    breakLoc: ESTree.Literal
    label: ESTree.Identifier

    constructor(breakLoc: ESTree.Literal, label: ESTree.Identifier){
        super()
        this.breakLoc = breakLoc
        this.label = label
    }
}

export class LeapManager {
    emitter: Emitter
    entryStack: Entry[]

    constructor(emitter){
        this.emitter = emitter
        this.entryStack = [new FunctionEntry(emitter.finalLoc)]
    }

    withEntry(entry:Entry, callback){
        this.entryStack.push(entry)
        try{
            callback.call(this.emitter)
        } finally {
            let popped = this.entryStack.pop();
            if(popped !== entry){
                throw new Error('LeapManager.withEntry pop_entry not the same as entry')
            }
        }
    }

    _findLeapLocation(property: string, label?: ESTree.Identifier){
        for(let i=this.entryStack.length; i>=0; i--){
            let entry = this.entryStack[i]
            let loc = entry[property]
            if(loc){
                if(label){
                    // @ts-ignore
                    if(entry.label && entry.label.name === label.name){
                        return loc
                    }
                }else if(entry instanceof LabeledEntry){

                }else {
                    return loc
                }
            }
        }
        return null
    }

    getBreakLoc(label: ESTree.Identifier){
        return this._findLeapLocation('breakLoc', label)
    }

    getContinueLoc(label: ESTree.Identifier){
        return this._findLeapLocation('continueLoc', label)
    }

}




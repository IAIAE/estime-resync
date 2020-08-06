# estime-resync
transform AST from with-(async/generator)-node to es5 compatible version, lightweight, fast, that you can use it runtime~

# usage

take notice that, estime-resync only transform AST based on [estree](https://github.com/estree/estree), it will not generate code. so, estime-resync is almostly used as a mid-tool in some pre-compile (or runtime-compile) system. You can use it will [acorn.js](https://github.com/acornjs/acorn).

```typescript
import {Parser} from 'acorn'
import Resync from 'estime-resync'

let ast = Parser.parse(`
async function foo(){
    return await Promise.resolve(123)
}
`)
// then you will get ast like this:
/**
 * {
 *  "type": "FunctionDeclaration",
 *  "start": 1,
 *  "end": 62,
 *  "id": {
 *      "type": "Identifier",
 *      "start": 16,
 *      "end": 19,
 *      "name": "foo"
 *  },
 *  "expression": false,
 *  "generator": false,
 *  "async": true,
 *  "body": ....
 * }
 */

// side effect: the ast is changed after call Resync.transform
Resync.transform(ast)

toCode(ast)
/**
 * function foo() {
 *  return resyncRuntime.async(function foo$(_context) {
 *      while (1) {
 *          switch (_context.prev = _context.next) {
 *              case 0:
 *                  _context.next = 2;
 *                  return resyncRuntime.awrap(Promise.resolve(123));
 *              case 2:
 *                  return _context.abrupt("return", _context.sent);
 *              case 3:
 *              case "end":
 *                  return _context.stop();
 *          }
 *      }
 *  }, null, null, null, Promise);
 * }
 */
```

# why this lib

async code cannot run on es5-runtime. so model pre-compiler transform async code to es5 version at compile time, like babel/typescript/regenerator. but babel/typescript is too large to run in runtime. this lib is armed at a small tool lib that can run in runtime.



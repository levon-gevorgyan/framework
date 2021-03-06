import {process} from "@barlus/node/process"
const defer = typeof setImmediate === 'function'
    ? setImmediate
    : function (fn, ...args) {
        process.nextTick(fn.bind.apply(fn, arguments))
    };
/**
 * Invoke callback when the response has finished, useful for
 * cleaning up resources afterwards.
 *
 * @param {object} msg
 * @param {function} listener
 * @return {object}
 * @public
 */
export function onFinished(msg, listener) {
    if (isFinished(msg) !== false) {
        defer(listener, null, msg);
        return msg
    }
    // attach the listener to the message
    attachListener(msg, listener);
    return msg
}
/**
 * Determine if message is already finished.
 *
 * @param {object} msg
 * @return {boolean}
 * @public
 */

export function isFinished(msg) {
    let socket = msg.socket;
    if (typeof msg.finished === 'boolean') {
        // OutgoingMessage
        return !!(msg.finished || (socket && !socket.writable))
    }
    if (typeof msg.complete === 'boolean') {
        // IncomingMessage
        return !!(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable))
    }
    // don't know
    return undefined
}
/**
 * Attach a finished listener to the message.
 *
 * @param {object} msg
 * @param {function} callback
 * @private
 */

function attachFinishedListener(msg, callback) {
    let eeMsg;
    let eeSocket;
    let finished = false;
    function onFinish(error) {
        eeMsg.cancel();
        eeSocket.cancel();
        finished = true;
        callback(error)
    }
    // finished on first message event
    eeMsg = eeSocket = first([[msg, 'end', 'finish']], onFinish);
    function onSocket(socket) {
        // remove listener
        msg.removeListener('socket', onSocket);
        if (finished) {
            return
        }
        if (eeMsg !== eeSocket) {
            return
        }
        // finished on first socket event
        eeSocket = first([[socket, 'error', 'close']], onFinish)
    }
    if (msg.socket) {
        // socket already assigned
        onSocket(msg.socket);
        return
    }
    // wait for socket to be assigned
    msg.on('socket', onSocket);
    if (msg.socket === undefined) {
        // node.js 0.8 patch
        patchAssignSocket(msg, onSocket)
    }
}
/**
 * Attach the listener to the message.
 *
 * @param {object} msg
 * @return {function}
 * @private
 */

function attachListener(msg, listener) {
    let attached = msg.__onFinished;
    // create a private single listener with queue
    if (!attached || !attached.queue) {
        attached = msg.__onFinished = createListener(msg);
        attachFinishedListener(msg, attached)
    }
    attached.queue.push(listener)
}
/**
 * Create listener on message.
 *
 * @param {object} msg
 * @return {function}
 * @private
 */

function createListener(msg) {
    const listener: any = (err) => {
        if (msg.__onFinished === listener) {
            msg.__onFinished = null
        }
        if (!listener.queue) {
            return
        }
        const queue = listener.queue;
        listener.queue = null;
        for (let i = 0; i < queue.length; i++) {
            queue[i](err, msg)
        }
    };
    listener.queue = [];
    return listener
}
/**
 * Patch ServerResponse.prototype.assignSocket for node.js 0.8.
 *
 * @param {ServerResponse} res
 * @param {function} callback
 * @private
 */

function patchAssignSocket(res, callback) {
    let assignSocket = res.assignSocket;
    if (typeof assignSocket !== 'function') {
        return
    }
    // res.on('socket', callback) is broken in 0.8
    res.assignSocket = function _assignSocket(socket) {
        assignSocket.call(this, socket);
        callback(socket)
    }
}
/**
 * Get the first event in a set of event emitters and event pairs.
 *
 * @param {array} stuff
 * @param {function} done
 * @public
 */

function first(stuff, done) {
    if (!Array.isArray(stuff)) {
        throw new TypeError('arg must be an array of [ee, events...] arrays');
    }
    var cleanups = [];
    for (var i = 0; i < stuff.length; i++) {
        var arr = stuff[i];
        if (!Array.isArray(arr) || arr.length < 2) {
            throw new TypeError('each array member must be [ee, events...]');
        }
        var ee = arr[0];
        for (var j = 1; j < arr.length; j++) {
            var event = arr[j];
            var fn = listener(event, callback);
            // listen to the event
            ee.on(event, fn);
            // push this listener to the list of cleanups
            cleanups.push({
                ee: ee,
                event: event,
                fn: fn,
            })
        }
    }
    function callback() {
        cleanup();
        done.apply(null, arguments)
    }
    function cleanup() {
        var x;
        for (var i = 0; i < cleanups.length; i++) {
            x = cleanups[i];
            x.ee.removeListener(x.event, x.fn)
        }
    }
    function thunk(fn) {
        done = fn
    }
    thunk['cancel'] = cleanup;
    return thunk
}
/**
 * Create the event listener.
 * @private
 */
function listener(event, done) {
    return (arg1) => {
        var args = new Array(arguments.length);
        var ee = this;
        var err = event === 'error'
            ? arg1
            : null;
        // copy args to prevent arguments escaping scope
        for (var i = 0; i < args.length; i++) {
            args[i] = arguments[i]
        }
        done(err, ee, event, args)
    }
}

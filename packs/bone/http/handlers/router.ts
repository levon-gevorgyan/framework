import {defineMetadata, getOwnMetadata, metadata} from "@barlus/runtime/Reflect";
import {Pattern} from "../../utils/matcher";
import {Handler} from '../application';
import {Context} from '../context';
import {Buffer} from '../../../node/buffer';

export class Resource {
    context:Context;
    constructor(context?){
        this.context = context;
    }
}
interface Route {
    type:Class<Resource>;
    method:string;
    action:string;
}
export class RouteHandler implements Handler {
    static register(type: Function) {
        console.info(type.name)
    }
    patterns:Pattern<Route>[];
    constructor(apiPath:string='/', resources: Class<Resource>[]=[]) {
        this.patterns = [];
        resources.forEach(r => {
            const resourcePath = getOwnMetadata('path', r);
            Object.getOwnPropertyNames(r.prototype).forEach(k=>{
                if(k!='constructor'){
                    const methodPath = getOwnMetadata('path', r.prototype, k);
                    const methodType = getOwnMetadata('method', r.prototype, k);
                    const routePath = `${apiPath}${resourcePath}${methodPath}`;
                    const routePattern = Pattern.regexp(routePath,{
                        type:r,
                        method:methodType,
                        action:k
                    } as Route);
                    this.patterns.push(routePattern);
                }
            })
        })
    }
    async handle(cnx: Context, next: () => Promise<any>) {
        const request = cnx.request;
        const pathname = request.url.pathname;
        for(let pattern of this.patterns){
            const route = pattern.meta;
            if(route.method==request.method){
                let params = pattern.exec(pathname);
                if(params){
                    const handler = new route.type(cnx);
                    const result = await handler[route.action](...params.slice(1));
                    cnx.response.setStatus(200);
                    if(typeof result == 'string'){
                        if(!cnx.response.headers.has('Content-Type')){
                            cnx.response.headers.set('Content-Type','text/plain');
                        }
                        cnx.response.setBody(async function * (){
                            yield Buffer.from(result)
                        }());
                    } else
                    if(typeof result == 'object' && result!=null){
                        cnx.response.headers.set('Content-Type','text/plain');
                        cnx.response.setBody(async function * (){
                            yield Buffer.from(JSON.stringify(result))
                        }());
                    }
                    return;
                }
            }
        }
        return next();
    }
}
export type route = ClassDecorator & {
    (description: string): ClassDecorator;
    get: MethodDecorator & {
        (path: string): MethodDecorator;
    }
    put: MethodDecorator & {
        (path: string): MethodDecorator;
    }
    post: MethodDecorator & {
        (path: string): MethodDecorator;
    }
    detete: MethodDecorator & {
        (path: string): MethodDecorator;
    }
};
export const route: route = Object.assign<any, any>(routeDecorator, {
    method: methodDecorator,
    get(target: Function | string, key?: string, desc?: PropertyDescriptor){
        return methodDecorator('GET',target,key,desc)
    },
    put(target: Function | string, key?: string, desc?: PropertyDescriptor){
        return methodDecorator('PUT',target,key,desc)
    },
    post(target: Function | string, key?: string, desc?: PropertyDescriptor){
        return methodDecorator('POST',target,key,desc)
    },
    detete(target: Function | string, key?: string, desc?: PropertyDescriptor){
        return methodDecorator('DELETE',target,key,desc)
    },
});
function routeDecorator(target: Function | string): any {
    function routeDecoratorForClass(path: string = '/') {
        return metadata('path', path)
    }
    if (typeof target == 'object') {
        return routeDecoratorForClass()(target)
    } else
    // if target is sting then path is provided
    if (typeof target == 'string') {
        return routeDecoratorForClass(target)
    } else {
        throw new TypeError('Invalid argument for route decorator');
    }
}

function methodDecorator(method:string, target: Function | string, key?: string, desc?: PropertyDescriptor): any {
    function routeDecoratorForMethod(method: string = 'GET', path:string='/') {
        return (target, key, desc)=>{
            defineMetadata('method',method,target, key);
            defineMetadata('path',path,target, key);
        }
    }
    if (typeof target == 'object') {
        return routeDecoratorForMethod()(target, key, desc)
    } else
    // if target is sting then path is provided
    if (typeof target == 'string') {
        return routeDecoratorForMethod(method,target)
    } else {
        throw new TypeError('Invalid argument for route decorator');
    }
}
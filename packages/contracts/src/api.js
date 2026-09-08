const id = { type: "string", minLength: 1, maxLength: 128, pattern: "^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_-]+$" };
const text = { type: "string", minLength: 1, maxLength: 300 };
const pin = { type: "string", pattern: "^(|[0-9]{4})$" };
const day = { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" };
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
export const kidSchema = object({ id, name:text, emoji:{ type:"string", maxLength:100 }, color:{ type:"string", maxLength:100 } }, ['id','name']);
export const choreSchema = object({ id, title:text, emoji:{ type:"string", maxLength:100 }, points:{ type:"integer", minimum:0 }, repeat:{ enum:['daily','weekly','once'] }, kidIds:{ type:'array', minItems:1, uniqueItems:true, items:id }, minCount:{ type:'integer', minimum:1 }, maxCount:{ type:'integer', minimum:1 }, gold:{ type:'boolean' } }, ['id','title','kidIds']);
export const rewardSchema = object({ id, title:text, emoji:{ type:"string", maxLength:100 }, cost:{ type:'integer', minimum:1 }, gold:{ type:'boolean' } }, ['id','title','cost']);
const task = { choreId:id, kidId:id, day };
export const payloadSchemas = {
  'kid.save': kidSchema, 'kid.remove':object({id}),
  'chore.save':choreSchema, 'chore.remove':object({id}), 'chore.restore':object({id}),
  'chore.complete':object({...task,versionId:{type:"string",minLength:1,maxLength:512}},Object.keys(task)), 'chore.undo':object({...task,versionId:{type:"string",minLength:1,maxLength:512}},Object.keys(task)),
  'chore.count':object({...task,versionId:{type:"string",minLength:1,maxLength:512}, delta:{ enum:[-1,1] }},[...Object.keys(task),'delta']),
  'reward.save':rewardSchema, 'reward.remove':object({id}),
  'reward.redeem':object({rewardId:id,kidId:id,day},['rewardId','kidId']),
  'pin.set':object({pin}),
  'settings.update':{...object({familyName:text,requireParentModeForCompletion:{type:'boolean'},requireParentModeForRedemptions:{type:'boolean'},mcpEnabled:{type:'boolean'}},[]),minProperties:1},
  'setup.finish':object({familyName:text,kids:{type:'array',minItems:1,items:kidSchema},pin}),
  'household.reset':object({}),
};
export const commandSchema = {
  oneOf:Object.entries(payloadSchemas).map(([type,payload]) => object({ id, type:{const:type}, payload })),
};
// Compatibility accepts historical optional fields and preserves unknown fields.
export const stateSchema = {
  type:'object', required:['version'], additionalProperties:true,
  properties:{
    version:{type:'integer',const:1}, requireParentModeForCompletion:{type:'boolean'},requireParentModeForRedemptions:{type:'boolean'},mcpEnabled:{type:'boolean'}, familyName:{type:'string'},pin:{type:'string'},setupDone:{type:'boolean'},
    updatedAt:{type:'number'}, nightMode:{type:'string'},
    kids:{type:'array',items:{type:'object',required:['id','name'],properties:{id:{type:'string'},name:{type:'string'}}}},
    chores:{type:'array',items:{type:'object',required:['id','title','kidIds'],properties:{id:{type:'string'},title:{type:'string'},kidIds:{type:'array',items:{type:'string'}}}}},
    rewards:{type:'array',items:{type:'object',required:['id','title','cost'],properties:{id:{type:'string'},title:{type:'string'},cost:{type:'number'}}}},
    completions:{type:'object',additionalProperties:{type:'number'}},
    counts:{type:'object',additionalProperties:{anyOf:[{type:'number'},{type:'object',properties:{n:{type:'number'},t:{type:'number'}},required:['n']}]}},
    spent:{type:'object',additionalProperties:{type:'number'}},goldSpent:{type:'object',additionalProperties:{type:'number'}},
  },
};

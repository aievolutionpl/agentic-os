declare module "@modelcontextprotocol/server-memory/dist/index.js" {
  interface Entity { name: string; entityType: string; observations: string[] }
  interface Relation { from: string; to: string; relationType: string }
  export class KnowledgeGraphManager {
    constructor(path: string);
    readGraph(): Promise<{ entities: Entity[]; relations: Relation[] }>;
    createEntities(entities: Entity[]): Promise<Entity[]>;
    createRelations(relations: Relation[]): Promise<Relation[]>;
    deleteEntities(names: string[]): Promise<void>;
    deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void>;
    addObservations(observations: { entityName: string; contents: string[] }[]): Promise<unknown>;
    deleteRelations(relations: Relation[]): Promise<void>;
  }
}

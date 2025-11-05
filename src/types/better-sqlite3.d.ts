declare module 'better-sqlite3' {
  interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number }
    get<T = any>(...params: any[]): T | undefined
    all<T = any>(...params: any[]): T[]
  }
  class Database {
    constructor(path: string, options?: { readonly?: boolean })
    prepare(sql: string): Statement
    exec(sql: string): void
    pragma(text: string): any
  }
  export default Database
}


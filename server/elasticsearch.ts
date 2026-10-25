import { EmailRecord } from './types.ts';
import { dbGetAllEmails } from './db.ts';

export interface ElasticsearchHit {
  _index: string;
  _id: string;
  _score: number;
  _source: EmailRecord;
  highlight?: {
    subject?: string[];
    body?: string[];
    recipient?: string[];
    sender?: string[];
  };
}

export interface ElasticsearchSearchResponse {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: {
      value: number;
      relation: 'eq';
    };
    max_score: number;
    hits: ElasticsearchHit[];
  };
}

class ElasticsearchEngine {
  private indexName = 'reachinbox_emails';
  private documents: Map<string, EmailRecord> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private isInitialized = false;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    const allEmails = await dbGetAllEmails();
    for (const email of allEmails) {
      this.indexDocument(email);
    }
    this.isInitialized = true;
    console.log(`[Elasticsearch] Indexed ${this.documents.size} email documents into index '${this.indexName}'.`);
  }

  private tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s@.-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  public indexDocument(doc: EmailRecord): void {
    this.documents.set(doc.id, doc);

    const searchableText = `${doc.subject} ${doc.body} ${doc.recipient} ${doc.sender} ${doc.status}`;
    const tokens = this.tokenize(searchableText);

    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(doc.id);
    }
  }

  public removeDocument(id: string): void {
    this.documents.delete(id);
    for (const [, set] of this.invertedIndex.entries()) {
      set.delete(id);
    }
  }

  public search(params: {
    query?: string;
    status?: string;
    sender?: string;
    limit?: number;
    offset?: number;
  }): ElasticsearchSearchResponse {
    const startTime = Date.now();
    const query = (params.query || '').trim().toLowerCase();
    const statusFilter = params.status?.trim().toLowerCase();
    const senderFilter = params.sender?.trim().toLowerCase();
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    let candidateIds: Set<string>;

    if (!query) {
      candidateIds = new Set(this.documents.keys());
    } else {
      const queryTokens = this.tokenize(query);
      candidateIds = new Set();

      for (const token of queryTokens) {
        // Direct matching or prefix matching
        for (const [indexedToken, docIds] of this.invertedIndex.entries()) {
          if (indexedToken.includes(token) || token.includes(indexedToken)) {
            for (const id of docIds) {
              candidateIds.add(id);
            }
          }
        }
      }
    }

    const scoredHits: ElasticsearchHit[] = [];

    for (const id of candidateIds) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      // Apply status filter if present
      if (statusFilter && statusFilter !== 'all' && doc.status.toLowerCase() !== statusFilter) {
        continue;
      }

      // Apply sender filter if present
      if (senderFilter && senderFilter !== 'all' && doc.sender.toLowerCase() !== senderFilter) {
        continue;
      }

      // Compute relevance score & highlights
      let score = 1.0;
      const highlight: { subject?: string[]; body?: string[] } = {};

      if (query) {
        const queryTokens = this.tokenize(query);
        for (const token of queryTokens) {
          if (doc.subject.toLowerCase().includes(token)) score += 3.5;
          if (doc.recipient.toLowerCase().includes(token)) score += 4.0;
          if (doc.sender.toLowerCase().includes(token)) score += 2.0;
          if (doc.body.toLowerCase().includes(token)) score += 1.5;
        }

        // Highlight snippet creation
        if (doc.subject.toLowerCase().includes(query)) {
          const reg = new RegExp(`(${query})`, 'gi');
          highlight.subject = [doc.subject.replace(reg, '<mark class="bg-amber-300 dark:bg-amber-800 text-slate-900 dark:text-white px-0.5 rounded">$1</mark>')];
        }

        if (doc.body.toLowerCase().includes(query)) {
          const index = doc.body.toLowerCase().indexOf(query);
          const start = Math.max(0, index - 30);
          const end = Math.min(doc.body.length, index + query.length + 50);
          const snippet = (start > 0 ? '...' : '') + doc.body.substring(start, end) + (end < doc.body.length ? '...' : '');
          const reg = new RegExp(`(${query})`, 'gi');
          highlight.body = [snippet.replace(reg, '<mark class="bg-amber-300 dark:bg-amber-800 text-slate-900 dark:text-white px-0.5 rounded">$1</mark>')];
        }
      }

      scoredHits.push({
        _index: this.indexName,
        _id: doc.id,
        _score: Math.round(score * 100) / 100,
        _source: doc,
        highlight: Object.keys(highlight).length > 0 ? highlight : undefined,
      });
    }

    // Sort by score descending, then by created_at / scheduled_at descending
    scoredHits.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return b._source.created_at - a._source.created_at;
    });

    const paginated = scoredHits.slice(offset, offset + limit);
    const maxScore = scoredHits.length > 0 ? scoredHits[0]._score : 0;
    const took = Date.now() - startTime;

    return {
      took,
      timed_out: false,
      _shards: {
        total: 1,
        successful: 1,
        skipped: 0,
        failed: 0,
      },
      hits: {
        total: {
          value: scoredHits.length,
          relation: 'eq',
        },
        max_score: maxScore,
        hits: paginated,
      },
    };
  }

  public parseElasticsearchDSL(body: any): ElasticsearchSearchResponse {
    let queryText = '';
    let statusFilter: string | undefined;
    let senderFilter: string | undefined;

    if (body?.query?.match) {
      const matchKey = Object.keys(body.query.match)[0];
      queryText = body.query.match[matchKey];
    } else if (body?.query?.query_string?.query) {
      queryText = body.query.query_string.query;
    } else if (body?.query?.multi_match?.query) {
      queryText = body.query.multi_match.query;
    } else if (typeof body?.query === 'string') {
      queryText = body.query;
    }

    if (body?.query?.bool?.filter) {
      const filters = Array.isArray(body.query.bool.filter) ? body.query.bool.filter : [body.query.bool.filter];
      for (const f of filters) {
        if (f?.term?.status) statusFilter = f.term.status;
        if (f?.term?.sender) senderFilter = f.term.sender;
      }
    }

    return this.search({
      query: queryText,
      status: statusFilter,
      sender: senderFilter,
      limit: body?.size || 50,
      offset: body?.from || 0,
    });
  }
}

export const elasticsearch = new ElasticsearchEngine();

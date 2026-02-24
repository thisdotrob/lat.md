import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import type { Root } from 'mdast'
import {
  wikiLinkSyntax,
  wikiLinkFromMarkdown,
  wikiLinkToMarkdown,
} from './extensions/wiki-link/index.js'

const processor = unified()
  .use(remarkParse)
  .use(remarkStringify)
  .data('micromarkExtensions', [wikiLinkSyntax()])
  .data('fromMarkdownExtensions', [wikiLinkFromMarkdown()])
  .data('toMarkdownExtensions', [wikiLinkToMarkdown()])

export function parse(markdown: string): Root {
  return processor.parse(markdown)
}

export function toMarkdown(tree: Root): string {
  return processor.stringify(tree)
}

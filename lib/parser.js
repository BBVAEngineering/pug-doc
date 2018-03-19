'use strict';
/* global require, module */

var pug = require('pug');
var pugRuntime = require('pug-runtime');

var path = require('path');
var YAML = require('js-yaml');
var getCodeBlock = require('pug-code-block');
var detectIndent = require('detect-indent');
var rebaseIndent = require('rebase-indent');
var pugdocArguments = require('./arguments');

var MIXIN_NAME_REGEX = /^mixin +([-\w]+)?/;
var DOC_REGEX = /^\s*\/\/-\s+?\@pugdoc\s*$/;
var DOC_STRING = '//- @pugdoc';
var CAPTURE_ALL = 'all';
var CAPTURE_SECTION = 'section';
var EXAMPLE_BLOCK = 'block';


/**
 * Returns all pugdoc comment and code blocks for the given code
 *
 * @param templateSrc {string}
 * @return {{lineNumber: number, comment: string, code: string}[]}
 */

function extractPugdocBlocks(templateSrc){
  return templateSrc
    .split('\n')
    // Walk through every line and look for a pugdoc comment
    .map(function(line, lineIndex){
      // If the line does not contain a pugdoc comment skip it
      if (!line.match(DOC_REGEX)){
        return undefined;
      }

      // If the line contains a pugdoc comment return
      // the comment block and the next code block
      var comment = getCodeBlock.byLine(templateSrc, lineIndex + 1);
      var meta = parsePugdocComment(comment);

      // add number of captured blocks
      if (meta.capture <= 0) {
        return undefined;
      }
      
      var capture = 2;
      if (meta.capture) {
        if (meta.capture === CAPTURE_ALL) {
          capture = Infinity;
        } else if (meta.capture === CAPTURE_SECTION) {
          capture = Infinity;
        } else {
          capture = meta.capture + 1;
        }
      }

      // get all code blocks
      var code = getCodeBlock.byLine(templateSrc, lineIndex + 1, capture);

      // make string
      if (Array.isArray(code)) {

        // remove comment
        code.shift();

        // join all code
        code = code.join('\n');
      } else {
        return undefined;
      }

      // filter out all but current pugdoc section
      if (meta.capture === CAPTURE_SECTION) {
        var nextPugDocIndex = code.indexOf(DOC_STRING);
        if (nextPugDocIndex > -1){
          code = code.substr(0, nextPugDocIndex);
        }
      }

      // if no code and no comment, skip
      if(comment.match(DOC_REGEX) && code === ''){
        return undefined;
      }

      return {
        lineNumber: lineIndex + 1,
        comment: comment,
        code: code
      };
    })
    // Remove skiped lines
    .filter(function(result){
      return result !== undefined;
    });
}


/**
 * Returns all pugdocDocuments for the given code
 *
 * @param templateSrc {string}
 * @param filename {string}
 */

function getPugdocDocuments(templateSrc, filename, locals){
  return extractPugdocBlocks(templateSrc)
    .map(function(pugdocBlock) {
      var meta = parsePugdocComment(pugdocBlock.comment);

      // parse jsdoc style arguments list
      if(meta.arguments){
        meta.arguments = meta.arguments.map(function(arg){
          return pugdocArguments.parse(arg, true);
        });
      }

      // parse jsdoc style attributes list
      if(meta.attributes){
        meta.attributes = meta.attributes.map(function(arg){
          return pugdocArguments.parse(arg, true);
        });
      }

      var source = pugdocBlock.code;
      source = source.replace(/\u2028|\u200B/g,'');

      var obj = {
        // get meta
        meta: meta,
        // add file path
        file: path.relative('.', filename),
        // get pug code block matching the comments indent
        source: source,
        // get html output
        output: compilePug(source, meta, filename, locals)
      };

      if (obj.output) {
        return obj;
      }

      return null;
    });
}


/**
 * Extract pug attributes from comment block
 */

function parsePugdocComment(comment){

  // remove first line (@pugdoc)
  if(comment.indexOf('\n') === -1){
    return {};
  }

  comment = comment.substr(comment.indexOf('\n'));
  comment = pugdocArguments.escapeArgumentsYAML(comment, 'arguments');
  comment = pugdocArguments.escapeArgumentsYAML(comment, 'attributes');

  // parse YAML
  return YAML.safeLoad(comment) || {};
}


/**
 * get all examples from the meta object
 * either one or both of meta.example and meta.examples can be given
 */

function getExamples(meta){
  var examples = [];
  if(meta.example){
    examples = examples.concat(meta.example);
  }
  if(meta.examples){
    examples = examples.concat(meta.examples);
  }
  return examples;
}

function renderPug(src, locals, filename) {
  var compiled = pug.compileClient(src, { filename: filename });

  try {
    var output = Function('pug', compiled + '\n' +'return template('+ JSON.stringify(locals || {}) +');')(pugRuntime);
    return output;
  } catch (err) {
    // render again to get better error messages 
    try {
      compiled = pug.compileClient(src, { filename: filename, compileDebug: true });
      Function('pug', compiled + '\n' +'return template('+ JSON.stringify(locals || {}) +');')(pugRuntime);
    } catch (debugErr) {
      process.stderr.write(debugErr.toString());
      return '';
    }
  }
}


/**
 * Compile Pug
 */

function compilePug(src, meta, filename, locals){
  var newSrc = [src];
  var locals = Object.assign({}, locals, meta.locals);

  // add example calls
  var examples = getExamples(meta).map(function(example, i){
    return renderPug(example, locals, filename);
  });

  return examples;
}


// Exports
module.exports = {
  extractPugdocBlocks: extractPugdocBlocks,
  getPugdocDocuments: getPugdocDocuments,
  parsePugdocComment: parsePugdocComment,
  getExamples: getExamples
};

module.exports = function type (graph, code) {
  const container = document.querySelector('.editor')
  graph.editor = CodeMirror(container, {
    value: code || "// No code provided",
    mode: "javascript",
    lineNumbers: true
  })

  graph.destroy.push(() => document.querySelector('.CodeMirror').remove())
}

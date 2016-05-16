module.exports = function name (code) {
  const container = document.querySelector('.editor')
  const editor = CodeMirror(container, {
    value: code || "// No code provided",
    mode: "javascript",
    lineNumbers: true
  })
  return editor
}

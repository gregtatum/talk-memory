exports.deepCopyLinks = function(list) {
  return list.map(l => Object.assign({}, l))
}

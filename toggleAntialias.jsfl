var items = fl.getDocumentDOM().library.items;

for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.itemType === 'bitmap') {
        item.allowSmoothing = item.allowSmoothing ? false : true;
    }
}

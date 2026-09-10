let IsVerifyClick = false
function verifyClick(targetNode)
{
    if (targetNode) {
        IsVerifyClick = true
        triggerMouseEvent(targetNode, 'mouseover')
        triggerMouseEvent(targetNode, 'mousedown')
        triggerMouseEvent(targetNode, 'mouseup')
        triggerMouseEvent(targetNode, 'click')
        IsVerifyClick = false
    }
    function triggerMouseEvent(node, eventType)
    {
        var ev = document.createEvent('MouseEvents')
        ev.initEvent(eventType, true, true)
        node.dispatchEvent(ev)
    }
}
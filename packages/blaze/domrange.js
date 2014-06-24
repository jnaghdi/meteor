
// A constant empty array (frozen if the JS engine supports it).
var _emptyArray = Object.freeze ? Object.freeze([]) : [];

// `[new] Blaze.DOMRange([nodeAndRangeArray])`
//
// A DOMRange consists of an array of consecutive nodes and DOMRanges,
// which may be replaced at any time with a new array.  If the DOMRange
// has been attached to the DOM at some location, then updating
// the array will cause the DOM to be updated at that location.
Blaze.DOMRange = function (nodeAndRangeArray) {
  if (! (this instanceof DOMRange))
    // called without `new`
    return new DOMRange(nodeAndRangeArray);

  var members = (nodeAndRangeArray || _emptyArray);
  if (! (members && (typeof members.length) === 'number'))
    throw new Error("Expected array");

  for (var i = 0; i < members.length; i++)
    this._memberIn(members[i]);

  this.members = members;
  this.emptyRangePlaceholder = null;
  this.attached = false;
  this.parentElement = null;
  this.parentRange = null;
  this.stopCallbacks = _emptyArray;
  this.augmenters = _emptyArray;
};
var DOMRange = Blaze.DOMRange;

// static methods
DOMRange._insert = function (rangeOrNode, parentElement, nextNode, _isMove) {
  var m = rangeOrNode;
  if (m instanceof DOMRange) {
    m.attach(parentElement, nextNode, _isMove);
  } else {
    if (_isMove)
      DOMRange._moveNodeWithHooks(m, parentElement, nextNode);
    else
      DOMRange._insertNodeWithHooks(m, parentElement, nextNode);
  }
};

DOMRange._remove = function (rangeOrNode) {
  var m = rangeOrNode;
  if (m instanceof DOMRange) {
    m.detach();
  } else {
    DOMRange._removeNodeWithHooks(m);
  }
};

DOMRange._removeNodeWithHooks = function (n) {
  if (! n.parentNode)
    return;
  if (n.nodeType === 1 &&
      n.parentNode._uihooks && n.parentNode._uihooks.removeElement) {
    n.parentNode._uihooks.removeElement(n);
  } else {
    n.parentNode.removeChild(n);
  }
};

DOMRange._insertNodeWithHooks = function (n, parent, next) {
  // `|| null` because IE throws an error if 'next' is undefined
  next = next || null;
  if (n.nodeType === 1 &&
      parent._uihooks && parent._uihooks.insertElement) {
    parent._uihooks.insertElement(n, next);
  } else {
    parent.insertBefore(n, next);
  }
};

DOMRange._moveNodeWithHooks = function (n, parent, next) {
  if (! n.parentNode)
    return;
  // `|| null` because IE throws an error if 'next' is undefined
  next = next || null;
  if (n.nodeType === 1 &&
      parent._uihooks && parent._uihooks.moveElement) {
    parent._uihooks.moveElement(n, next);
  } else {
    parent.insertBefore(n, next);
  }
};

DOMRange.forElement = function (elem) {
  if (elem.nodeType !== 1)
    throw new Error("Expected element, found: " + elem);
  var range = null;
  while (elem && ! range) {
    range = (elem.$blaze_range || null);
    if (! range)
      elem = elem.parentNode;
  }
  return range;
};

DOMRange.prototype.attach = function (parentElement, nextNode, _isMove) {
  // This method is called to insert the DOMRange into the DOM for
  // the first time, but it's also used internally when
  // updating the DOM.
  //
  // If _isMove is true, move this attached range to a different
  // location under the same parentElement.
  if (_isMove) {
    if (! (this.parentElement === parentElement &&
           this.attached))
      throw new Error("Can only move an attached DOMRange, and only under the same parent element");
  }

  var members = this.members;
  if (members.length) {
    this.emptyRangePlaceholder = null;
    for (var i = 0; i < members.length; i++) {
      DOMRange._insert(members[i], parentElement, nextNode, _isMove);
    }
  } else {
    var placeholder = document.createTextNode("");
    this.emptyRangePlaceholder = placeholder;
    parentElement.insertBefore(placeholder, nextNode || null);
  }
  this.attached = true;
  this.parentElement = parentElement;

  if (! _isMove) {
    for(var i = 0; i < this.augmenters.length; i++)
      this.augmenters[i].attach(this, parentElement);
  }
};

DOMRange.prototype.setMembers = function (newNodeAndRangeArray) {
  var newMembers = newNodeAndRangeArray;
  if (! (newMembers && (typeof newMembers.length) === 'number'))
    throw new Error("Expected array");

  var oldMembers = this.members;

  for (var i = 0; i < oldMembers.length; i++)
    this._memberOut(oldMembers[i]);
  for (var i = 0; i < newMembers.length; i++)
    this._memberIn(newMembers[i]);

  if (! this.attached) {
    this.members = newMembers;
  } else {
    // don't do anything if we're going from empty to empty
    if (newMembers.length || oldMembers.length) {
      // detach the old members and insert the new members
      var nextNode = this.lastNode().nextSibling;
      var parentElement = this.parentElement;
      this.detach();
      this.members = newMembers;
      this.attach(parentElement, nextNode);
    }
  }
};

DOMRange.prototype.firstNode = function () {
  if (! this.attached)
    throw new Error("Must be attached");

  if (! this.members.length)
    return this.emptyRangePlaceholder;

  var m = this.members[0];
  return (m instanceof DOMRange) ? m.firstNode() : m;
};

DOMRange.prototype.lastNode = function () {
  if (! this.attached)
    throw new Error("Must be attached");

  if (! this.members.length)
    return this.emptyRangePlaceholder;

  var m = this.members[this.members.length - 1];
  return (m instanceof DOMRange) ? m.lastNode() : m;
};

DOMRange.prototype.detach = function () {
  if (! this.attached)
    throw new Error("Must be attached");

  var oldParentElement = this.parentElement;
  var members = this.members;
  if (members.length) {
    for (var i = 0; i < members.length; i++) {
      DOMRange._remove(members[i]);
    }
  } else {
    var placeholder = this.emptyRangePlaceholder;
    this.parentElement.removeChild(placeholder);
    this.emptyRangePlaceholder = null;
  }
  this.attached = false;
  this.parentElement = null;

  for(var i = 0; i < this.augmenters.length; i++)
    this.augmenters[i].detach(this, oldParentElement);
};

DOMRange.prototype.addMember = function (newMember, atIndex, _isMove) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex <= members.length))
    throw new Error("Bad index in range.addMember: " + atIndex);

  if (! _isMove)
    this._memberIn(newMember);

  if (! this.attached) {
    // currently detached; just updated members
    members.splice(atIndex, 0, newMember);
  } else if (members.length === 0) {
    // empty; use the empty-to-nonempty handling of setMembers
    this.setMembers([newMember]);
  } else {
    var nextNode;
    if (atIndex === members.length) {
      // insert at end
      nextNode = this.lastNode().nextSibling;
    } else {
      var m = members[atIndex];
      nextNode = (m instanceof DOMRange) ? m.firstNode() : m;
    }
    members.splice(atIndex, 0, newMember);
    DOMRange._insert(newMember, this.parentElement, nextNode, _isMove);
  }
};

DOMRange.prototype.removeMember = function (atIndex, _isMove) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex < members.length))
    throw new Error("Bad index in range.removeMember: " + atIndex);

  if (_isMove) {
    members.splice(atIndex, 1);
  } else {
    var oldMember = members[atIndex];
    this._memberOut(oldMember);

    if (members.length === 1) {
      // becoming empty; use the logic in setMembers
      this.setMembers(_emptyArray);
    } else {
      members.splice(atIndex, 1);
      if (this.attached)
        DOMRange._remove(oldMember);
    }
  }
};

DOMRange.prototype.moveMember = function (oldIndex, newIndex) {
  var member = this.members[oldIndex];
  this.removeMember(oldIndex, true /*_isMove*/);
  this.addMember(member, newIndex, true /*_isMove*/);
};

DOMRange.prototype.getMember = function (atIndex) {
  var members = this.members;
  if (! (atIndex >= 0 && atIndex < members.length))
    throw new Error("Bad index in range.getMember: " + atIndex);
  return this.members[atIndex];
};

DOMRange.prototype.stop = function () {
  var stopCallbacks = this.stopCallbacks;
  for (var i = 0; i < stopCallbacks.length; i++)
    stopCallbacks[i].call(this);
  this.stopCallbacks = _emptyArray;
};

DOMRange.prototype.onstop = function (cb) {
  if (this.stopCallbacks === _emptyArray)
    this.stopCallbacks = [];
  this.stopCallbacks.push(cb);
};

DOMRange.prototype._memberIn = function (m) {
  if (m instanceof DOMRange)
    m.parentRange = this;
  else if (m.nodeType === 1) // DOM Element
    m.$blaze_range = this;
};

DOMRange.prototype._memberOut = function (m) {
  // old members are almost always GCed immediately.
  // to avoid the potentialy performance hit of deleting
  // a property, we simple null it out.
  if (m instanceof DOMRange)
    m.parentRange = null;
  else if (m.nodeType === 1) // DOM Element
    m.$blaze_range = null;
};

DOMRange.prototype.containsElement = function (elem) {
  if (! this.attached)
    throw new Error("Must be attached");

  // An element is contained in this DOMRange if it's possible to
  // reach it by walking parent pointers, first through the DOM and
  // then parentRange pointers.  In other words, the element or some
  // ancestor of it is at our level of the DOM (a child of our
  // parentElement), and this element is one of our members or
  // is a member of a descendant Range.

  if (! Blaze._elementContains(this.parentElement, elem))
    return false;

  while (elem.parentNode !== this.parentElement)
    elem = elem.parentElement;

  var range = elem.$blaze_range;
  while (range && range !== this)
    range = range.parentRange;

  return range === this;
};

DOMRange.prototype.containsRange = function (range) {
  if (! this.attached)
    throw new Error("Must be attached");

  if (! range.attached)
    return false;

  // A DOMRange is contained in this DOMRange if it's possible
  // to reach this range by following parent pointers.  If the
  // DOMRange has the same parentElement, then it should be
  // a member, or a member of a member etc.  Otherwise, we must
  // contain its parentElement.

  if (range.parentElement !== this.parentElement)
    return this.containsElement(range.parentElement);

  if (range === this)
    return false; // don't contain self

  while (range && range !== this)
    range = range.parentRange;

  return range === this;
};

DOMRange.prototype.addDOMAugmenter = function (augmenter) {
  if (this.augmenters === _emptyArray)
    this.augmenters = [];
  this.augmenters.push(augmenter);
};

DOMRange.prototype.$ = function (selector) {
  var self = this;

  var parentNode = this.parentElement;
  if (! parentNode)
    throw new Error("Can't select in removed DomRange");

  // Strategy: Find all selector matches under parentNode,
  // then filter out the ones that aren't in this DomRange
  // using `DOMRange#containsElement`.  This is
  // asymptotically slow in the presence of O(N) sibling
  // content that is under parentNode but not in our range,
  // so if performance is an issue, the selector should be
  // run on a child element.

  // Since jQuery can't run selectors on a DocumentFragment,
  // we don't expect findBySelector to work.
  if (parentNode.nodeType === 11 /* DocumentFragment */)
    throw new Error("Can't use $ on an offscreen range");

  var results = Blaze.DOMBackend.findBySelector(selector, parentNode);

  // We don't assume `results` has jQuery API; a plain array
  // should do just as well.  However, if we do have a jQuery
  // array, we want to end up with one also, so we use
  // `.filter`.

  // Function that selects only elements that are actually
  // in this DomRange, rather than simply descending from
  // `parentNode`.
  var filterFunc = function (elem) {
    // handle jQuery's arguments to filter, where the node
    // is in `this` and the index is the first argument.
    if (typeof elem === 'number')
      elem = this;

    return self.containsElement(elem);
  };

  if (! results.filter) {
    // not a jQuery array, and not a browser with
    // Array.prototype.filter (e.g. IE <9)
    var newResults = [];
    for (var i = 0; i < results.length; i++) {
      var x = results[i];
      if (filterFunc(x))
        newResults.push(x);
    }
    results = newResults;
  } else {
    // `results.filter` is either jQuery's or ECMAScript's `filter`
    results = results.filter(filterFunc);
  }

  return results;
};

Blaze.DOMAugmenter = function () {};
Blaze.DOMAugmenter.prototype.attach = function (range, element) {};
  // arguments are same as were passed to `attach`
Blaze.DOMAugmenter.prototype.detach = function (range, element) {};

Blaze.EventAugmenter = function (eventMap, thisInHandler) {
  this.eventMap = eventMap;
  this.handles = [];
  this.thisInHandler = thisInHandler; // optional
};
JSClass.inherits(Blaze.EventAugmenter, Blaze.DOMAugmenter);

Blaze.EventAugmenter.prototype.attach = function (range, element) {
  var self = this;
  var eventMap = self.eventMap;
  var handles = self.handles;

  _.each(eventMap, function (handler, spec) {
    var clauses = spec.split(/,\s+/);
    // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
    _.each(clauses, function (clause) {
      var parts = clause.split(/\s+/);
      if (parts.length === 0)
        return;

      var newEvents = parts.shift();
      var selector = parts.join(' ');
      handles.push(Blaze.EventSupport.listen(
        element, newEvents, selector,
        function (evt) {
          if (! range.containsElement(evt.currentTarget))
            return null;
          return handler.apply(self.thisInHandler || this, arguments);
        },
        range, function (r) {
          return r.parentRange;
        }));
    });
  });
};

Blaze.EventAugmenter.prototype.detach = function () {
  _.each(this.handles, function (h) {
    h.stop();
  });
  this.handles.length = 0;
};


// Returns true if element a contains node b and is not node b.
//
// The restriction that `a` be an element (not a document fragment,
// say) is based on what's easy to implement cross-browser.
Blaze._elementContains = function (a, b) {
  if (a.nodeType !== 1) // ELEMENT
    return false;
  if (a === b)
    return false;

  if (a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 0x10;
  } else {
    // Should be only old IE and maybe other old browsers here.
    // Modern Safari has both functions but seems to get contains() wrong.
    // IE can't handle b being a text node.  We work around this
    // by doing a direct parent test now.
    b = b.parentNode;
    if (! (b && b.nodeType === 1)) // ELEMENT
      return false;
    if (a === b)
      return true;

    return a.contains(b);
  }
};

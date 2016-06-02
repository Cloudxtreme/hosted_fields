;
/*
 Copyright 2015 BPS Info Solutions, Inc.
 DO NOT STORE A LOCAL COPY OF THIS FILE.  PLEASE LINK DIRECTLY TO ULTRACART TO USE THIS FILE.
 Failing to do so could break your site if we need to upgrade this file, as your version may become
 incompatible with the back end interface.
 */

(UltraCartHostedFields = function (jQuery, JSON, window, sessionCredentials, form, cssUrls, overlayZIndex, autoCopyStyles, debugMode) {

  // Make sure that if they tried to turn on debug mode, but we don't have console logging that we turn it off
  if (console && console.log && debugMode) {
    // OK to have debug mode on
  } else {
    // Make sure it's off
    debugMode = false;
  }

  // If they didn't specify any autoCopyStyles then create the default.  Check for undefined so that it's possible for
  // them to configure an empty array to turn off this behavior
  if (typeof autoCopyStyles === "undefined") {
    autoCopyStyles = [
      // Padding
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",

      // Text
      "lineHeight",
      "fontSize",
      "fontFamily",
      "fontStyle",
      "fontWeight",

      // Color
      "backgroundColor",
      "color",

      // Border
      "borderBottomColor",
      "borderBottomLeftRadius",
      "borderBottomRightRadius",
      "borderBottomStyle",
      "borderBottomWidth",
      "borderCollapse",
      "borderLeftColor",
      "borderLeftStyle",
      "borderLeftWidth",
      "borderRightColor",
      "borderRightStyle",
      "borderRightWidth",
      "borderSpacing",
      "borderTopColor",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderTopStyle",
      "borderTopWidth"
    ];
  }

  // Complain if we don't have jQuery or JSON
  if (typeof jQuery == 'undefined') {
    alert('jQuery is not loaded.  This is required for UltraCart hosted fields.  Add jQuery to your page.');
  }
  if (typeof JSON === 'object' && typeof JSON.parse === 'function') {
    // browser has JSON support.
  } else {
    alert("JSON is not supported.  This is required for UltraCart hosted fields.  Add a JSON polyfill script on your page.");
  }

  // Just in case we start writing any $ syntax alias it locally
  //noinspection UnnecessaryLocalVariableJS,JSUnusedLocalSymbols
  var $ = jQuery;

  var base = this;

  // Store away the session credentials
  base.sessionCredentials = sessionCredentials;
  base.form = form;
  base.cssUrls = cssUrls;

  // Start a field id counter
  base.fieldIdCounter = 0;
  // Track the fields we setup
  base.fields = [];

  base.preventIPadSelectCrashes = function () {
    var selectOverlayId = 1;

    jQuery('select').each(function () {
      var select = jQuery(this);

      // Get the parent of the underlying select
      var parent = select.parent();

      // If the parent's position is static, change it to relative for more reliable overlay positioning on mobile zoom
      if (parent.css('position') === 'static') {
        parent.css('position', 'relative');
        if (debugMode) console.log("Changed position of ", parent, " from static to relative.");
      }

      var selectOverlay = jQuery("<input>", {id: 'selectOverlay' + selectOverlayId, type: 'text', style: 'border: none; background: transparent;', 'z-index': overlayZIndex});
      select.after(selectOverlay);

      jQuery(document).on("focus", '#selectOverlay' + selectOverlayId, function () {
        jQuery(this).blur();
        jQuery(this).css('z-index', -1000);
        select.focus();
      });

      select.on("blur", function () {
        selectOverlay.css('z-index', overlayZIndex);
      });

      base.maintainSelectOverlay(select, selectOverlay);

      selectOverlayId++;
    });
  };

  // Create method that will be called to setup a field
  //noinspection JSUnusedGlobalSymbols
  base.setupField = function (fieldType, fieldConfig) {

    var that = this;

    // Make sure the fieldType is valid
    if (fieldType !== "creditCardNumber" && fieldType !== "creditCardCvv2") return;

    // Find the field that we're going to overlay
    var underlying;
    if (fieldConfig.selectorContext) {
      underlying = jQuery(fieldConfig.selector, fieldConfig.selectorContext);
    } else {
      underlying = jQuery(fieldConfig.selector);
    }

    // Make sure they haven't set the type of the input field to number since we will be returning back masked values
    if (underlying.attr('type') && underlying.attr('type') === 'number') {
      alert("Please change input type for " + fieldConfig.selector + " from number to text.");
    }


    // If it wasn't specified on the configuration, get the underlying fields value and placeholder to start.
    if (!fieldConfig.value) {
      fieldConfig.value = underlying.val();
    }
    if (!fieldConfig.placeholder) {
      fieldConfig.placeholder = underlying.attr('placeholder');
    }

    // Get the parent of the underlying and append a new DIV to be the overlay
    var parent = underlying.parent();

    // If the parent's position is static, change it to relative for more reliable overlay positioning on mobile zoom
    if (parent.css('position') === 'static') {
      parent.css('position', 'relative');
      if (debugMode) console.log("Changed position of ", parent, " from static to relative.");
    }

    // Get the jQuery element that will contain the iframe
    underlying.after("<div id='" + fieldType + "Overlay'></div>");
    var container = jQuery("#" + fieldType + "Overlay");

    // Do they want us to update the token?
    var tokenHolder = null;
    if (fieldConfig.tokenSelector) {
      tokenHolder = jQuery(fieldConfig.tokenSelector);
    }

    // Make sure this overlay stays over the underlying input at all times.
    base.matchOverlay(underlying, container);
    jQuery(window).resize(function () {
      base.matchOverlay(underlying, container);
    });

    // Create an object to represent this field
    var fieldObject = {};
    base.fieldIdCounter++;
    fieldObject.id = base.fieldIdCounter;
    fieldObject.fieldType = fieldType;
    fieldObject.fieldConfig = fieldConfig;
    fieldObject.loaded = false;
    fieldObject.bufferedMessages = [];
    fieldObject.receiveMessageHandler = that.fieldReceiveMessageHandler;
    // Store the callback on our object and then clear it from the config so it's safe to ship in a message to the child.
    fieldObject.callback = fieldConfig.callback;
    fieldConfig.callback = null;
    fieldObject.change = fieldConfig.change;
    fieldConfig.change = null;
    // If there is no default change handler, then the default is to update the underlying field and then trigger the change event
    if (!fieldObject.change) {
      if (debugMode) console.log("No change handler on field " + fieldType + ".  Adding default change handler.");

      fieldObject.change = function (value) {

        if (debugMode) console.log("change handler called for value for underlying field ", underlying);

        // Update this so we don't trigger a loop back to the field.
        fieldObject.lastUnderlyingVal = value;

        underlying.val(value);
        if (debugMode) console.log("New value of underlying field ", underlying, " is ", underlying.val());
        underlying.trigger("change");
        if (debugMode) console.log("New value of underlying field after trigger:change on ", underlying, " is ", underlying.val());

      }
    } else {
      if (debugMode) console.log("Custom change handler specified in field config for " + fieldType);
    }
    // Store these away so we can destroy things.
    fieldObject.container = container;
    fieldObject.parent = parent;
    fieldObject.underlying = underlying;
    fieldObject.tokenHolder = tokenHolder;

    // Start this out with the value of the field as it's used by the maintainOverlay to detect autofill
    fieldObject.lastUnderlyingVal = underlying.val();

    // Set the tab index to -1 so this element doesn't get tabbed into any more
    fieldObject.underlyingOriginalTabIndex = underlying.attr('tabindex');
    underlying.attr('tabindex', '-1');
    // Hide the field so we don't get any artifacts if the overlay isn't 100% perfect
    underlying.css('visibility', 'hidden');

    // Add the field object to our collection
    base.fields[fieldObject.id] = fieldObject;

    // Build up the iFrame.  Add two parameters to prevent caching
    var iFrameHtml = '<iframe src="https://token.ultracart.com/checkout/checkout-hosted-fields-1.0.jsp?r=' + Math.random() + '&t=' + new Date().getTime() + '" sandbox="allow-scripts allow-same-origin" style="width: 100%; height: 100%; border: none; padding: 0; margin: 0; overflow: hidden;"></iframe>';

    // Set the HTML into the container element
    container.html(iFrameHtml);

    // Store away the content window of the iframe we just created
    fieldObject.iframeContentWindow = container.find('iframe')[0].contentWindow;

    // Set the tab index on the iframe so that the tab order is the same.
    if (fieldObject.underlyingOriginalTabIndex) {
      container.find('iframe').attr('tabindex', fieldObject.underlyingOriginalTabIndex);
    }

    // If we haven't loaded the iframe in 5 seconds, then checkForLoad will retry
    fieldObject.retryIFrameLoadInMillis = 5000;
    fieldObject.retryCount = 0;

    // Start the check for load loop
    base.checkForLoad(fieldObject);

    // Every 1 second make sure the overlay is in the right spot.  This first call kicks things off
    base.maintainOverlay(fieldObject, underlying, container);

    // Start a timer where we will display an error on the screen if the underlying field did not load after 60 seconds
    fieldObject.checkForLoadTimer = setTimeout(function () {
      alert("Failed to load credit card field [" + fieldType + "] after 60 seconds.\nPlease make sure that your browser is not blocking iframes.");
    }, 60000);
  };

  //noinspection JSUnusedGlobalSymbols
  base.fieldReceiveMessageHandler = function (message) {
    if (debugMode) console.log("fieldReceiveMessageHandler", message);
    var fieldObject = this;

    if (message.messageType === "ready") {
      fieldObject.loaded = true;

      // Clear the timeout that is waiting to check for the field to fail to load.
      clearTimeout(fieldObject.checkForLoadTimer);

      // If there are any buffered messages then send them to the window now
      if (fieldObject.bufferedMessages.length) {
        if (debugMode) console.log("There are " + fieldObject.bufferedMessages.length + " buffered messages to send to the hosted field.");

        for (var i = 0; i < fieldObject.bufferedMessages.length; i++) {
          fieldObject.iframeContentWindow.postMessage(
              JSON.stringify(fieldObject.bufferedMessages[i])
              ,
              "*"
          );
          if (debugMode) console.log("Sent buffered message", fieldObject.bufferedMessages[i]);
        }

        // Clear the buffer
        fieldObject.bufferedMessages = [];
      }

    } else if (message.messageType === "creditCardNumberTokenized") {
      // If they've registered a callback give them the event
      if (fieldObject.callback) {
        fieldObject.callback(message.card);
      }
    } else if (message.messageType === "change") {
      if (debugMode) console.log("process change message");
      // If they've registered a callback give them the event
      if (fieldObject.change) {
        if (debugMode) console.log("Calling change handler with value", message.value);
        fieldObject.change(message.value);
      } else {
        if (debugMode) console.log("no change method configured on fieldObject", fieldObject);
      }

      // If a token came back and they specified the selector for the token holder, then update that field and trigger
      // it's change method so they can do something like update a backbone model or something.
      if (fieldObject.tokenHolder && message.token) {
        fieldObject.tokenHolder.val(message.token);
        fieldObject.tokenHolder.trigger("change");
      }
    } else if (message.messageType === "blur") {
      fieldObject.underlying.triggerHandler("blur");
      base.maintainOverlay(fieldObject.underlying, fieldObject.container);
    } else if (message.messageType === "focus") {
      fieldObject.underlying.triggerHandler("focus");
      base.maintainOverlay(fieldObject.underlying, fieldObject.container);
    }
  };

  //noinspection JSUnusedGlobalSymbols
  base.checkForLoad = function (fieldObject) {
    var that = this;

    // Make sure we don't process this twice.
    if (fieldObject.loaded) {
      return;
    }

    // If we haven't loaded the iframe in 5 seconds, then checkForLoad will retry
    fieldObject.retryIFrameLoadInMillis -= 100;
    if (fieldObject.retryIFrameLoadInMillis <= 0) {
      fieldObject.retryCount++;
      fieldObject.retryIFrameLoadInMillis = 5000;

      // Retry
      if (debugMode) console.log("Retry iframe load count", fieldObject.retryCount);
      // Change the src attribute on the iframe to cause it to reload the iframe
      fieldObject.container.find('iframe').attr('src', 'https://token.ultracart.com/checkout/checkout-hosted-fields-1.0-dev-alpha.jsp?r=' + Math.random() + '&t=' + new Date().getTime());
    }
    if (debugMode && fieldObject.retryIFrameLoadInMillis % 1000 == 0) console.log("Retry iframe load in millis", fieldObject.retryIFrameLoadInMillis);

    // Build the object we need
    var readyCheckMessage = {
      'messageType': 'readyCheck',
      'id': fieldObject.id,
      'sessionCredentials': base.sessionCredentials,
      'cssUrls': base.cssUrls,
      'fieldType': fieldObject.fieldType,
      'fieldConfig': {
        'value': fieldObject.fieldConfig.value,
        'placeholder': fieldObject.fieldConfig.placeholder
      },
      'debugMode': debugMode
    };

    // Send the iframe a message to see if it's ready
    fieldObject.iframeContentWindow.postMessage(
        JSON.stringify(readyCheckMessage)
        ,
        "*"
    );

    // Wait and try again
    setTimeout(function () {
      that.checkForLoad(fieldObject);
    }, 100);
  };

  // This is our universal message handler
  //noinspection JSUnusedGlobalSymbols
  base.receiveMessageHandler = function (event) {
    if (debugMode) console.log("parent receiveMessage", event);

    // Validate where we received this message from.
    if ("https://token.ultracart.com" !== event.origin) {
      // Ignore messages that aren't from the hosted fields iframes
      return;
    }

    var message = null;
    try {
      message = JSON.parse(event.data);
    } catch (e) {
      // This really should never happen...
      alert("Error parsing message from hosted field.");
    }

    // If the message that we parsed has the appropriate id then we'll dispatch it to the field.
    if (message && message.id && base.fields[message.id]) {
      base.fields[message.id].receiveMessageHandler(message);
    }
  };

  base.maintainOverlay = function (fieldObject, underlying, overlay) {

    // Look at specific styles on the underlying field
    try {
      if (fieldObject.loaded && autoCopyStyles.length > 0) {
        var underlyingStyles = base.getStyles(underlying, autoCopyStyles);
        var underlyingStylesJson = JSON.stringify(underlyingStyles);
        // If they have changed since the last thing we notified about then send that through
        if (fieldObject.lastUnderlyingCssJson !== underlyingStylesJson) {
          fieldObject.lastUnderlyingCssJson = underlyingStylesJson;

          // Build the object we need
          var setStylesMessage = {
            'messageType': 'setStyles',
            'styles': underlyingStyles
          };

          // Send the iframe a message to add the class
          fieldObject.iframeContentWindow.postMessage(
              JSON.stringify(setStylesMessage)
              ,
              "*"
          );

        }
      }
    } catch (e) {
    }

    // Check to see if the value in the field has been updated by an auto fill program
    try {
      if (fieldObject.loaded) {
        var underlyingVal = underlying.val();
        // If there has been a change then send the notification to the hosted field.  It will tokenize the data and
        // send back the masked values to us.
        if (underlyingVal && fieldObject.lastUnderlyingVal !== underlyingVal) {
          fieldObject.lastUnderlyingVal = underlyingVal;

          if (debugMode) console.log("Notify hosted field of value.  Autofill plugin");

          // Build the object we need
          var setValueMessage = {
            'messageType': 'setValue',
            'value': underlyingVal
          };

          // Send the iframe a message to add the class
          fieldObject.iframeContentWindow.postMessage(
              JSON.stringify(setValueMessage)
              ,
              "*"
          );

        }
      }
    } catch (e) {
    }

    // Check their positions and if they are not equal then sync them up.
    try {

      var underlyingPosition = underlying.position();

      // Compensate for the top and left margin on the underlying element
      var underlyingTop = underlyingPosition.top + (parseInt(underlying.css('margin-top')) || 0);
      var underlyingLeft = underlyingPosition.left + (parseInt(underlying.css('margin-left')) || 0);

      var overlayPosition = overlay.position();
      if (underlyingPosition && overlayPosition) {
        // Look for more than one pixel of difference since the browsers will use sub-pixel positions which are never going to match right up.
        var diffTop = Math.abs(underlyingTop - overlayPosition.top);
        var diffLeft = Math.abs(underlyingLeft - overlayPosition.left);
        if (diffTop >= 1 || diffLeft >= 1) {
          base.matchOverlay(underlying, overlay);
        } else {
          // Has the position stayed the same, but the size changed
          var diffWidth = Math.abs(underlying.outerWidth(false) - overlay.outerWidth(false));
          var diffHeight = Math.abs(underlying.outerHeight(false) - overlay.outerHeight(false));
          if (diffWidth >= 1 || diffHeight >= 1) {
            base.matchOverlay(underlying, overlay);
          }
        }
      }
    } catch (e) {
    }

    // Call ourselves again and again to maintain the position and state
    setTimeout(function () {
      base.maintainOverlay(fieldObject, underlying, overlay);
    }, 100);
  };

  base.maintainSelectOverlay = function (underlying, overlay) {

    // Check their positions and if they are not equal then sync them up.
    try {
      var overlayPosition;

      // See if the element we're wanting to overlay is current visible and not hidden.
      if (underlying.is(":visible") && !underlying.is(":hidden")) {
        var underlyingPosition = underlying.position();

        // Show the overlay if it's hidden
        if (overlay.is(":hidden")) {
          if (debugMode) console.log("Restoring overlay for select since underlying is now visible.");
          overlay.show();
        }

        // Compensate for the top and left margin on the underlying element
        var underlyingTop = underlyingPosition.top + (parseInt(underlying.css('margin-top')) || 0);
        var underlyingLeft = underlyingPosition.left + (parseInt(underlying.css('margin-left')) || 0);

        overlayPosition = overlay.position();
        if (underlyingPosition && overlayPosition) {
          // Look for more than one pixel of difference since the browsers will use sub-pixel positions which are never going to match right up.
          var diffTop = Math.abs(underlyingTop - overlayPosition.top);
          var diffLeft = Math.abs(underlyingLeft - overlayPosition.left);
          if (diffTop >= 1 || diffLeft >= 1) {
            base.matchOverlay(underlying, overlay);
          } else {
            // Has the position stayed the same, but the size changed
            var diffWidth = Math.abs(underlying.outerWidth(false) - overlay.outerWidth(false));
            var diffHeight = Math.abs(underlying.outerHeight(false) - overlay.outerHeight(false));
            if (diffWidth >= 1 || diffHeight >= 1) {
              base.matchOverlay(underlying, overlay);
            }
          }
        }
      } else {
        // Hide the overlay
        if (!overlay.is(":hidden")) {
          if (debugMode) console.log("Hiding overlay for select since underlying is no longer visible.");
          overlay.hide();
        }
      }

    } catch (e) {
    }

    // Call ourselves again and again to maintain the position and state
    setTimeout(function () {
      base.maintainSelectOverlay(underlying, overlay);
    }, 100);
  };

  //noinspection JSUnusedGlobalSymbols
  base.matchOverlay = function (underlying, overlay) {
// This is making Safari very upset.
//    overlay.css('width', 0);
//    overlay.css('height', 0);

    var underlyingPosition = underlying.position();
    // Compensate for the top and left margin on the underlying element
    var underlyingTop = underlyingPosition.top + (parseInt(underlying.css('margin-top')) || 0);
    var underlyingLeft = underlyingPosition.left + (parseInt(underlying.css('margin-left')) || 0);

    overlay.css('position', 'absolute');
    overlay.css('top', underlyingTop);
    overlay.css('left', underlyingLeft);
    overlay.css('width', underlying.outerWidth(false));
    overlay.css('height', underlying.outerHeight(false));
    overlay.css('z-index', overlayZIndex);
  };

  base.destroy = function () {
    window.removeEventListener("message", base.receiveMessageHandler);
    for (var i = 0; i < base.fields.length; i++) {
      var fieldObject = base.fields[i];
      if (fieldObject) {
        // Clear the timeout that is waiting to check for the field to fail to load.
        if(fieldObject.checkForLoadTimer){
          clearTimeout(fieldObject.checkForLoadTimer);
        }

        fieldObject.container.remove();
        // Restore the original tab index or remove the tab index = -1 one that we set so this element can rejoin the tab index.
        if (fieldObject.underlyingOriginalTabIndex) {
          fieldObject.underlying.attr('tabIndex', fieldObject.underlyingOriginalTabIndex);
        } else {
          fieldObject.underlying.removeAttr('tabIndex');
        }
        // Bring the visibility back for their field
        fieldObject.underlying.css('visibility', 'visible');
      }
    }

    if (base.form) {
      jQuery(base.form).off('submit', base.enableInputsForSubmit);
    }
  };

  base.addClass = function (className, fieldType) {
    if (!fieldType) {
      fieldType = 'all';
    }

    for (var i = 0; i < base.fields.length; i++) {
      var fieldObject = base.fields[i];
      if (fieldObject && (fieldObject.fieldType === fieldType || 'all' === fieldType)) {
        // Build the object we need
        var addClassMessage = {
          'messageType': 'addClass',
          'className': className
        };

        // Send the iframe a message to add the class
        if (fieldObject.loaded) {
          fieldObject.iframeContentWindow.postMessage(
              JSON.stringify(addClassMessage)
              ,
              "*"
          );
        } else {
          // Buffer the message until the hosted field declares itself ready.
          fieldObject.bufferedMessages.push(addClassMessage);
        }

      }
    }
  };

  base.removeClass = function (className, fieldType) {
    if (!fieldType) {
      fieldType = 'all';
    }

    for (var i = 0; i < base.fields.length; i++) {
      var fieldObject = base.fields[i];
      if (fieldObject && (fieldObject.fieldType === fieldType || 'all' === fieldType)) {
        // Build the object we need
        var removeClassMessage = {
          'messageType': 'removeClass',
          'className': className
        };

        // Send the iframe a message to add the class
        if (fieldObject.loaded) {
          fieldObject.iframeContentWindow.postMessage(
              JSON.stringify(removeClassMessage)
              ,
              "*"
          );
        } else {
          // Buffer the message until the hosted field declares itself ready.
          fieldObject.bufferedMessages.push(removeClassMessage);
        }

      }
    }
  };

  //noinspection JSUnusedGlobalSymbols
  base.enableInputsForSubmit = function () {
//    for (var i = 0; i < base.fields.length; i++) {
//      var fieldObject = base.fields[i];
//      if (fieldObject) {
//        // Re-enable the underlying field
//        fieldObject.underlying.prop('disabled', false);
//      }
//    }
  };


  base.getStyles = function (jqElement, only, except) {
    /*
     The following method imported from the jquery.copycss.js project on the Github.  The following copywrite notice
     applies only to this getStyles method.
     */
    /*
     Copyright 2014 Mike Dunn
     http://upshots.org/
     Permission is hereby granted, free of charge, to any person obtaining
     a copy of this software and associated documentation files (the
     "Software"), to deal in the Software without restriction, including
     without limitation the rights to use, copy, modify, merge, publish,
     distribute, sublicense, and/or sell copies of the Software, and to
     permit persons to whom the Software is furnished to do so, subject to
     the following conditions:

     The above copyright notice and this permission notice shall be
     included in all copies or substantial portions of the Software.

     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
     EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
     NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
     LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
     OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
     WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
     */

    // the map to return with requested styles and values as KVP
    var product = {};

    // the style object from the DOM element we need to iterate through
    var style;

    // recycle the name of the style attribute
    var name;

    // declare variables
    var i, l;

    // if it's a limited list, no need to run through the entire style object
    if (only && only instanceof Array) {

      for (i = 0, l = only.length; i < l; i++) {
        // since we have the name already, just return via built-in .css method
        name = only[i];
        product[name] = jqElement.css(name);
      }

    } else {

      // prevent from empty selector
      if (jqElement.length) {

        // otherwise, we need to get everything
        var dom = jqElement.get(0);

        // standards
        if (window.getComputedStyle) {

          // convenience methods to turn css case ('background-image') to camel ('backgroundImage')
          var pattern = /\-([a-z])/g;
          var uc = function (a, b) {
            return b.toUpperCase();
          };
          var camelize = function (string) {
            return string.replace(pattern, uc);
          };

          // make sure we're getting a good reference
          if (style = window.getComputedStyle(dom, null)) {
            var camel, value;
            // opera doesn't give back style.length - use truthy since a 0 length may as well be skipped anyways
            if (style.length) {
              for (i = 0, l = style.length; i < l; i++) {
                name = style[i];
                camel = camelize(name);
                value = style.getPropertyValue(name);
                product[camel] = value;
              }
            } else {
              // opera
              for (name in style) {
                camel = camelize(name);
                value = style.getPropertyValue(name) || style[name];
                product[camel] = value;
              }
            }
          }
        }
        // IE - first try currentStyle, then normal style object - don't bother with runtimeStyle
        else if (style = dom.currentStyle) {
          for (name in style) {
            product[name] = style[name];
          }
        }
        else if (style = dom.style) {
          for (name in style) {
            if (typeof style[name] != 'function') {
              product[name] = style[name];
            }
          }
        }
      }
    }

    // remove any styles specified...
    // be careful on blacklist - sometimes vendor-specific values aren't obvious but will be visible...  e.g., excepting 'color' will still let '-webkit-text-fill-color' through, which will in fact color the text
    if (except && except instanceof Array) {
      for (i = 0, l = except.length; i < l; i++) {
        name = except[i];
        delete product[name];
      }
    }

    // one way out so we can process blacklist in one spot
    return product;
  };


  // Attach an onsubmit handler to the form to re-enable all the underlying fields
  if (base.form) {
    jQuery(base.form).on('submit', base.enableInputsForSubmit);
  }

  // Setup a message event listener
  if (window.addEventListener) {
    window.addEventListener("message", base.receiveMessageHandler, false);
  } else if (window.attachEvent) {
    window.attachEvent('onmessage', base.receiveMessageHandler);
  }

});

/**
 * Polyfill to add add/remove Event Listener support to IE8
 */
!window.addEventListener && (function (WindowPrototype, DocumentPrototype, ElementPrototype, addEventListener, removeEventListener, dispatchEvent, registry) {
  WindowPrototype[addEventListener] = DocumentPrototype[addEventListener] = ElementPrototype[addEventListener] = function (type, listener) {
    var target = this;

    registry.unshift([target, type, listener, function (event) {
      event.currentTarget = target;
      event.preventDefault = function () { event.returnValue = false };
      event.stopPropagation = function () { event.cancelBubble = true };
      event.target = event.srcElement || target;

      listener.call(target, event);
    }]);

    this.attachEvent("on" + type, registry[0][3]);
  };

  WindowPrototype[removeEventListener] = DocumentPrototype[removeEventListener] = ElementPrototype[removeEventListener] = function (type, listener) {
    for (var index = 0, register; register = registry[index]; ++index) {
      if (register[0] == this && register[1] == type && register[2] == listener) {
        return this.detachEvent("on" + type, registry.splice(index, 1)[0][3]);
      }
    }
  };

  WindowPrototype[dispatchEvent] = DocumentPrototype[dispatchEvent] = ElementPrototype[dispatchEvent] = function (eventObject) {
    return this.fireEvent("on" + eventObject.type, eventObject);
  };
})(Window.prototype, HTMLDocument.prototype, Element.prototype, "addEventListener", "removeEventListener", "dispatchEvent", []);

/**
 * This is the main setup method that should be called from the outside
 * @param jQuery An instance of jQuery.
 * @param JSON An instance of JSON
 * @param config The configuration for the hosted fields.
 */
UltraCartHostedFields.setup = function (jQuery, JSON, config) {

  // Create the state object that contains all the hosted field
  var uchf = new UltraCartHostedFields(jQuery, JSON, window, config.sessionCredentials, config.form, config.cssUrls,
      config.overlayZIndex || 999999, config.autoCopyStyles, window.ultraCartHostedFieldsDebugMode || false);

  // Did they pass in a config that contained an array of hosted fields
  if (config && config.hostedFields) {
    if (config.hostedFields.creditCardNumber) {
      var fieldCreditCardNumber = config.hostedFields.creditCardNumber;

      // Did they specify a selector and does this element actually exist.
      if (!fieldCreditCardNumber.selector) {
        alert("No selector specified for creditCardNumber field.");
      } else {
        // Create the selector used to find the underlying
        var creditCardNumberSelector;
        if (fieldCreditCardNumber.selectorContext) {
          creditCardNumberSelector = jQuery(fieldCreditCardNumber.selector, fieldCreditCardNumber.selectorContext);
        } else {
          creditCardNumberSelector = jQuery(fieldCreditCardNumber.selector);
        }

        if (creditCardNumberSelector.size() == 1) {
          uchf.setupField("creditCardNumber", fieldCreditCardNumber);
        } else if (creditCardNumberSelector.size() == 0) {
          if (fieldCreditCardNumber.alertIfMissing) {
            alert("Selector for creditCardNumber did not find the element on the page.\nPlease make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
          } else {
            try {
              if (console) {
                if (console.error) {
                  console.error("Selector for creditCardNumber did not find the element on the page. Please make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
                } else if (console.log) {
                  console.log("Selector for creditCardNumber did not find the element on the page. Please make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
                }
              }
            } catch (e) {
              // Ignore any errors on trying to log in an older browser on this error.
            }
          }
        } else if (creditCardNumberSelector.size() > 1) {
          alert("Selector for creditCardNumber found more than one element.");
        }
      }

    }
    if (config.hostedFields.creditCardCvv2) {
      var fieldCreditCardCvv2 = config.hostedFields.creditCardCvv2;

      if (!fieldCreditCardCvv2.selector) {
        alert("No selector specified for creditCardCvv2 field.");
      } else {
        // Create the selector used to find the underlying
        var creditCardCvv2Selector;
        if (fieldCreditCardCvv2.selectorContext) {
          creditCardCvv2Selector = jQuery(fieldCreditCardCvv2.selector, fieldCreditCardCvv2.selectorContext);
        } else {
          creditCardCvv2Selector = jQuery(fieldCreditCardCvv2.selector);
        }

        // Did they specify a selector and does this element actually exist.
        // Bug in StoreFront templates makes us check the URL as well.
        if (creditCardCvv2Selector.size() == 1) {
          uchf.setupField("creditCardCvv2", fieldCreditCardCvv2);
        } else if (creditCardCvv2Selector.size() == 0) {
          if (fieldCreditCardCvv2.alertIfMissing) {
            alert("Selector for creditCardCvv2 did not find the element on the page.\nPlease make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
          } else {
            try {
              if (console) {
                if (console.error) {
                  console.error("Selector for creditCardCvv2 did not find the element on the page. Please make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
                } else if (console.log) {
                  console.log("Selector for creditCardCvv2 did not find the element on the page. Please make sure that the element exists and is attached to the DOM before calling UltraCartHostedFields.setup().");
                }
              }
            } catch (e) {
              // Ignore any errors on trying to log in an older browser on this error.
            }
          }
        } else if (creditCardCvv2Selector.size() > 1) {
          alert("Selector for creditCardCvv2 found more than one element.");
        }

      }

    }

    if (navigator.userAgent && navigator.userAgent.indexOf("AppleWebKit") != -1 && navigator.userAgent.indexOf("Mobile") != -1 && navigator.userAgent.indexOf("Android") == -1) {
      uchf.preventIPadSelectCrashes();
    }
  }

  // Return the main object which they can store and call methods on later
  return uchf;
};

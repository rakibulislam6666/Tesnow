/* ==========================================================================
   Tesnow — Login
   Vanilla JS, no dependencies. Safe on browsers commonly available on
   Android 9+ and modern desktop browsers.
   ========================================================================== */
'use strict';

(function () {
  /* ------------------------------------------------------------------------
     Configuration — adjust to match the Tesnow backend contract.
     Do NOT invent endpoints; only the login endpoint is wired here.
     ------------------------------------------------------------------------ */
  var LOGIN_ENDPOINT = '/auth/login';
  var DEFAULT_ERROR  = 'Something went wrong. Please try again.';
  var NETWORK_ERROR  = 'Network unavailable. Check your connection and retry.';
  var AUTH_ERROR     = 'Invalid email or password.';

  /* ------------------------------------------------------------------------
     Small DOM helpers (no globals leaked)
     ------------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute('hidden', '');
    else        el.removeAttribute('hidden');
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null ? '' : String(text);
  }

  /* ------------------------------------------------------------------------
     Local fallback "toast"/status.
     This is intentionally small and self-contained so it can be removed
     once the real Tesnow toast API is known. It does NOT pollute window.
     ------------------------------------------------------------------------ */
  function createStatus(el) {
    var tone = null;
    var timer = null;

    function show(message, kind) {
      if (!el) return;
      tone = kind || 'info';
      el.setAttribute('data-tone', tone);
      var textEl = el.querySelector('[data-status-text]');
      setText(textEl, message);
      setHidden(el, false);
      if (timer) clearTimeout(timer);
      if (kind === 'success') {
        timer = setTimeout(function () { hide(); }, 4000);
      }
    }

    function hide() {
      if (!el) return;
      setHidden(el, true);
      el.removeAttribute('data-tone');
      if (timer) { clearTimeout(timer); timer = null; }
    }

    return { show: show, hide: hide };
  }

  /* ------------------------------------------------------------------------
     Field validation
     ------------------------------------------------------------------------ */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function isProbablyEmail(value) {
    return EMAIL_RE.test(value);
  }

  function setFieldError(fieldEl, message) {
    if (!fieldEl) return;
    var control = fieldEl.querySelector('.field__input');
    var errorEl = fieldEl.querySelector('.field__error');
    if (message) {
      fieldEl.setAttribute('data-invalid', 'true');
      if (control) control.setAttribute('aria-invalid', 'true');
      if (errorEl) {
        setText(errorEl, message);
        setHidden(errorEl, false);
      }
    } else {
      fieldEl.removeAttribute('data-invalid');
      if (control) control.removeAttribute('aria-invalid');
      if (errorEl) {
        setText(errorEl, '');
        setHidden(errorEl, true);
      }
    }
  }

  function validateEmail(fieldEl, value) {
    var v = (value || '').trim();
    if (!v) {
      setFieldError(fieldEl, 'Please enter your email or username.');
      return false;
    }
    /* Only enforce email shape if it looks like an email attempt. */
    if (v.indexOf('@') !== -1 && !isProbablyEmail(v)) {
      setFieldError(fieldEl, 'That email address looks incomplete.');
      return false;
    }
    setFieldError(fieldEl, '');
    return true;
  }

  function validatePassword(fieldEl, value) {
    if (!value) {
      setFieldError(fieldEl, 'Please enter your password.');
      return false;
    }
    setFieldError(fieldEl, '');
    return true;
  }

  /* ------------------------------------------------------------------------
     Response parsing
     ------------------------------------------------------------------------ */
  function parseResponse(res) {
    var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (ct.indexOf('application/json') !== -1) {
      return res.json().catch(function () { return null; });
    }
    return res.text().then(function (t) {
      if (!t) return null;
      /* Only try JSON if it actually looks like JSON. */
      var trimmed = t.trim();
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        try { return JSON.parse(trimmed); } catch (e) { return null; }
      }
      return null;
    });
  }

  /* Extract a user-safe message from a backend payload without leaking
     internals. We only trust well-known, top-level fields. */
  function extractSafeMessage(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var candidates = ['message', 'error', 'detail'];
    for (var i = 0; i < candidates.length; i++) {
      var v = payload[candidates[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     Login flow
     ------------------------------------------------------------------------ */
  function init() {
    var form       = $('#login-form');
    if (!form) return;

    var statusEl   = $('#login-status');
    var status     = createStatus(statusEl);

    var emailInput = $('#login-email');
    var passInput  = $('#login-password');
    var emailField = emailInput && emailInput.closest('.field');
    var passField  = passInput  && passInput.closest('.field');

    var submitBtn  = $('#login-submit');
    var submitLbl  = submitBtn && submitBtn.querySelector('.btn__label');
    var spinner    = submitBtn && submitBtn.querySelector('.btn__spinner');

    var toggleBtn  = $('#toggle-password');
    var eyeOn      = toggleBtn && toggleBtn.querySelector('.icon-eye');
    var eyeOff     = toggleBtn && toggleBtn.querySelector('.icon-eye-off');

    var inFlight   = false;
    var controller = null;

    /* ----- Password visibility toggle ----- */
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', function () {
        var showing = passInput.type === 'text';
        passInput.type = showing ? 'password' : 'text';
        toggleBtn.setAttribute('aria-pressed', showing ? 'false' : 'true');
        toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        setHidden(eyeOn, showing ? false : true);
        setHidden(eyeOff, showing ? true : false);
        /* Keep caret in the field */
        try {
          var len = passInput.value.length;
          passInput.focus();
          if (passInput.setSelectionRange) passInput.setSelectionRange(len, len);
        } catch (e) { /* ignore */ }
      });
    }

    /* ----- Clear field errors as user types ----- */
    if (emailInput) {
      emailInput.addEventListener('input', function () {
        if (emailField && emailField.getAttribute('data-invalid') === 'true') {
          setFieldError(emailField, '');
        }
      });
    }
    if (passInput) {
      passInput.addEventListener('input', function () {
        if (passField && passField.getAttribute('data-invalid') === 'true') {
          setFieldError(passField, '');
        }
      });
    }

    /* ----- Submit state helpers ----- */
    function setLoading(isLoading) {
      inFlight = isLoading;
      if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      }
      if (spinner) setHidden(spinner, !isLoading);
      if (submitLbl) submitLbl.textContent = isLoading ? 'Signing in…' : 'Sign in';
    }

    /* ----- Prevent double-submit on Enter key spam ----- */
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && inFlight) {
        e.preventDefault();
      }
    });

    /* ----- Submit handler ----- */
    form.addEventListener('submit', function (event) {
      if (inFlight) {
        event.preventDefault();
        return;
      }

      /* Local UX validation first (never the security boundary). */
      var emailOk = validateEmail(emailField, emailInput && emailInput.value);
      var passOk  = validatePassword(passField, passInput && passInput.value);

      if (!emailOk || !passOk) {
        event.preventDefault();
        status.hide();
        /* Move focus to the first invalid field for accessibility. */
        var firstInvalid = form.querySelector('.field[data-invalid="true"] .field__input');
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
          firstInvalid.focus();
        }
        return;
      }

      /* If the browser supports fetch, do an async submit so we can render
         precise errors without losing the field values.
         If not, allow the native form POST to /auth/login (progressive). */
      if (typeof window.fetch !== 'function' || typeof window.AbortController !== 'function') {
        /* Fallback: let the browser perform a normal POST. */
        setLoading(true);
        return;
      }

      event.preventDefault();
      status.hide();

      var formData = new FormData(form);

      /* Abort any previous request (defensive). */
      if (controller) { try { controller.abort(); } catch (e) {} }
      controller = new AbortController();

      setLoading(true);

      fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin', /* normal session cookie behavior */
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      }).then(function (res) {
        return parseResponse(res).then(function (payload) {
          return { res: res, payload: payload };
        });
      }).then(function (result) {
        var res = result.res;
        var payload = result.payload;

        if (res.ok) {
          /* Success: prefer a server-provided redirect, otherwise go home. */
          var redirect =
            (payload && typeof payload === 'object' &&
              (payload.redirect || payload.redirectTo || payload.next)) || null;

          status.show('Signed in. Redirecting…', 'success');
          var target = typeof redirect === 'string' && redirect ? redirect : '/';
          /* Slight delay so the success state is perceivable. */
          setTimeout(function () { window.location.assign(target); }, 250);
          return;
        }

        /* Non-2xx */
        setLoading(false);

        if (res.status === 401 || res.status === 403) {
          status.show(AUTH_ERROR, 'error');
          /* Do not reveal which field was wrong. */
          if (passInput) passInput.value = '';
          if (passInput && typeof passInput.focus === 'function') passInput.focus();
          return;
        }

        if (res.status === 400 || res.status === 422) {
          var msg = extractSafeMessage(payload);
          /* Map known field-level errors onto the fields themselves. */
          var fieldErrors =
            payload && typeof payload === 'object' &&
            (payload.errors || payload.fieldErrors || null);

          if (fieldErrors && typeof fieldErrors === 'object') {
            if (fieldErrors.email   && emailField) setFieldError(emailField, String(fieldErrors.email));
            if (fieldErrors.username && emailField) setFieldError(emailField, String(fieldErrors.username));
            if (fieldErrors.password && passField) setFieldError(passField, String(fieldErrors.password));
          }

          status.show(msg || 'Please check the form and try again.', 'error');
          return;
        }

        if (res.status >= 500) {
          status.show(DEFAULT_ERROR, 'error');
          return;
        }

        status.show(extractSafeMessage(payload) || DEFAULT_ERROR, 'error');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        setLoading(false);
        status.show(NETWORK_ERROR, 'error');
      }).then(function () {
        /* Always clear the controller reference. */
        controller = null;
      });
    });

    /* ----- Surface server-rendered error (if any) ----- */
    if (statusEl && statusEl.hasAttribute('hidden') === false) {
      /* EJS may render the banner already visible with a message. */
      var pre = statusEl.querySelector('[data-status-text]');
      if (pre && pre.textContent && pre.textContent.trim()) {
        statusEl.setAttribute('data-tone', statusEl.getAttribute('data-tone') || 'error');
      }
    }
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
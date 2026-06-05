(function () {
  'use strict'

  // Aliniat cu src/features/leads/constants.ts (INTERESE, GRUPE, GRUPA_LABELS,
  // CURSURI, LOCATII). Dacă lista se schimbă în recepție, actualizează aici.
  var INTERESE = [
    'Street Dance',
    'K-pop',
    'Gimnastică',
    'Zumba',
    'Acrobatică',
    'Quasar for Kids',
    'Altceva',
  ]
  var GRUPE = [
    { value: 'Tiny',     label: 'Tiny (4-6 ani)' },
    { value: 'Junior',   label: 'Junior (7-10 ani)' },
    { value: 'Varsity',  label: 'Varsity (11-14 ani)' },
    { value: 'Teens',    label: 'Teens (15-19 ani)' },
    { value: 'Students', label: 'Students (20-25 ani)' },
    { value: 'Adults',   label: 'Adulți (>25)' },
  ]
  var CURSURI = [
    'Street Dance',
    'Acrobatică',
    'K-pop Covers',
    'Quasar for Kids',
    'Zumba',
    'Tabără de dans',
  ]
  var LOCATII = ['Ștefan cel Mare', 'Nicolina']

  function getUtm() {
    var params = new URLSearchParams(window.location.search)
    return {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag)
    if (attrs) {
      for (var key in attrs) {
        var val = attrs[key]
        if (val === false || val === null || val === undefined) continue
        if (key === 'class') node.className = val
        else if (key === 'text') node.textContent = val
        else node.setAttribute(key, val)
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        node.appendChild(children[i])
      }
    }
    return node
  }

  function field(name, label, opts) {
    opts = opts || {}
    var input = el('input', {
      class: 'qleads-input',
      name: name,
      id: 'qleads-' + name,
      type: opts.type || 'text',
      required: opts.required ? '' : false,
    })
    var lbl = el('label', { class: 'qleads-label', for: 'qleads-' + name })
    lbl.textContent = label + (opts.required ? ' *' : '')
    return { wrap: el('div', { class: 'qleads-field' }, [lbl, input]), input: input }
  }

  function selectField(name, label, options) {
    var sel = el('select', {
      class: 'qleads-input',
      name: name,
      id: 'qleads-' + name,
    })
    sel.appendChild(el('option', { value: '', text: '— selectează —' }))
    for (var i = 0; i < options.length; i++) {
      var o = options[i]
      var v = typeof o === 'string' ? o : o.value
      var t = typeof o === 'string' ? o : o.label
      sel.appendChild(el('option', { value: v, text: t }))
    }
    var lbl = el('label', { class: 'qleads-label', for: 'qleads-' + name })
    lbl.textContent = label
    return { wrap: el('div', { class: 'qleads-field' }, [lbl, sel]), input: sel }
  }

  function textareaField(name, label) {
    var ta = el('textarea', {
      class: 'qleads-input qleads-textarea',
      name: name,
      id: 'qleads-' + name,
      rows: '3',
    })
    var lbl = el('label', { class: 'qleads-label', for: 'qleads-' + name })
    lbl.textContent = label
    return { wrap: el('div', { class: 'qleads-field' }, [lbl, ta]), input: ta }
  }

  function row(children) {
    return el('div', { class: 'qleads-row' }, children)
  }

  function showModal(trigger) {
    var endpoint = trigger.getAttribute('data-qleads-endpoint')
    if (!endpoint) {
      console.error('[qleads] lipseste data-qleads-endpoint pe', trigger)
      return
    }
    var campanie = trigger.getAttribute('data-qleads-campanie') || 'Website quasardance.ro'
    var defaultCurs = trigger.getAttribute('data-qleads-curs') || ''

    var prenume = field('prenume', 'Prenume', {})
    var nume = field('nume', 'Nume', { required: true })
    var telefon = field('telefon', 'Telefon', { type: 'tel', required: true })
    var email = field('email', 'Email', { type: 'email' })
    var numeParinte = field('nume_parinte', 'Nume părinte (dacă înscrii copilul)', {})
    var dataNasterii = field('data_nasterii', 'Data nașterii cursantului', { type: 'date' })
    var interes = selectField('interes', 'Interes principal', INTERESE)
    var grupa = selectField('grupa_varsta', 'Grupa de vârstă', GRUPE)
    var cursInteres = selectField('curs_interes', 'Curs preferat', CURSURI)
    var locatia = selectField('locatia', 'Locație preferată', LOCATII)
    var mesaj = textareaField('mesaj', 'Mesaj (opțional)')

    if (defaultCurs) cursInteres.input.value = defaultCurs

    var submitBtn = el('button', {
      class: 'qleads-submit',
      type: 'submit',
      text: 'Trimite',
    })
    var status = el('div', { class: 'qleads-status' })

    var form = el('form', { class: 'qleads-form' }, [
      row([prenume.wrap, nume.wrap]),
      row([telefon.wrap, email.wrap]),
      row([numeParinte.wrap, dataNasterii.wrap]),
      row([interes.wrap, grupa.wrap]),
      row([cursInteres.wrap, locatia.wrap]),
      mesaj.wrap,
      submitBtn,
      status,
    ])

    var closeBtn = el('button', {
      class: 'qleads-close',
      type: 'button',
      'aria-label': 'Inchide',
    })
    closeBtn.textContent = '×'

    var title = el('h3', { class: 'qleads-title' })
    title.textContent = defaultCurs ? 'Înscriere — ' + defaultCurs : 'Înscriere Quasar Dance'

    var subtitle = el('p', { class: 'qleads-subtitle' })
    subtitle.textContent = 'Te contactăm în cel mai scurt timp pentru a stabili o ședință gratuită.'

    var card = el('div', { class: 'qleads-card' }, [closeBtn, title, subtitle, form])
    var overlay = el('div', { class: 'qleads-overlay' }, [card])

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }
    closeBtn.addEventListener('click', close)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close()
    })

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      submitBtn.disabled = true
      submitBtn.textContent = 'Se trimite…'
      status.textContent = ''

      var utm = getUtm()
      var payload = {
        nume: nume.input.value.trim(),
        prenume: prenume.input.value.trim() || null,
        nume_parinte: numeParinte.input.value.trim() || null,
        telefon: telefon.input.value.trim(),
        email: email.input.value.trim() || null,
        data_nasterii: dataNasterii.input.value || null,
        interes: interes.input.value || null,
        curs_interes: cursInteres.input.value || null,
        grupa_varsta: grupa.input.value || null,
        locatia: locatia.input.value || null,
        mesaj: mesaj.input.value.trim() || null,
        campanie: campanie,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (b) {
            return { ok: r.ok, body: b }
          })
        })
        .then(function (res) {
          if (res.ok) {
            status.className = 'qleads-status qleads-status-ok'
            status.textContent = 'Mulțumim! Te contactăm cât mai curând.'
            setTimeout(close, 2500)
          } else {
            status.className = 'qleads-status qleads-status-err'
            status.textContent = (res.body && res.body.error) || 'Eroare. Încearcă din nou.'
            submitBtn.disabled = false
            submitBtn.textContent = 'Trimite'
          }
        })
        .catch(function () {
          status.className = 'qleads-status qleads-status-err'
          status.textContent = 'Eroare de rețea. Încearcă din nou.'
          submitBtn.disabled = false
          submitBtn.textContent = 'Trimite'
        })
    })

    document.body.appendChild(overlay)
    prenume.input.focus()
  }

  function init() {
    var triggers = document.querySelectorAll('[data-qleads-trigger]')
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i]
      if (t.__qleadsBound) continue
      t.__qleadsBound = true
      t.addEventListener('click', function (e) {
        e.preventDefault()
        showModal(e.currentTarget)
      })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  window.QLeads = { init: init, open: showModal }
})()

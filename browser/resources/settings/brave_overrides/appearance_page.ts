// Copyright (c) 2020 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// you can obtain one at https://mozilla.org/MPL/2.0/.

// @ts-nocheck TODO(petemill): Define types and remove ts-nocheck

import {RegisterPolymerTemplateModifications} from 'chrome://resources/polymer_overriding.js'
import {I18nBehavior} from 'chrome://resources/i18n_behavior.js'
import {Router} from '../router.js'
import {loadTimeData} from '../i18n_setup.js'

import '../brave_appearance_page/super_referral.js'
import '../brave_appearance_page/brave_theme.js'
import '../brave_appearance_page/toolbar.js'

const superReferralStringId = 'superReferralThemeName'

RegisterPolymerTemplateModifications({
  'settings-appearance-page': (templateContent) => {
    const theme = templateContent.getElementById('themeRow')
    if (!theme) {
      console.error(`[Brave Settings Overrides] Couldn't find #themeRow`)
    } else {
      const useDefaultButtonTemplate = templateContent.querySelector('template[is=dom-if][if="[[prefs.extensions.theme.id.value]]"]')
      if (!useDefaultButtonTemplate) {
        console.error('[Brave Settings Overrides] Appearance Page cannot find use default theme button template')
      } else {
        useDefaultButtonTemplate.setAttribute("restamp", "true")
      }
      theme.setAttribute("class", "settings-row hr")
      theme.insertAdjacentHTML('beforebegin', `
        <settings-brave-appearance-theme prefs="{{prefs}}"></settings-brave-appearance-theme>
      `)
    }
    const r = Router.getInstance().routes_
    // Super-referral
    // W/o super referral, we don't need to themes link option with themes sub
    // page.
    const hasSuperReferral = (
      loadTimeData.valueExists(superReferralStringId) &&
      loadTimeData.getString(superReferralStringId) !== ''
    )
    if (hasSuperReferral) {
      // Routes
      if (!r.APPEARANCE) {
        console.error('[Brave Settings Overrides] Routes: could not find APPEARANCE page')
        return
      } else {
        r.THEMES = r.APPEARANCE.createChild('/themes');
        // Hide chromium's theme section. It's replaced with our themes page.
        if (theme) {
          theme.remove()
        }
      }
    }
    // Toolbar prefs
    const bookmarkBarToggle = templateContent.querySelector('[pref="{{prefs.bookmark_bar.show_on_all_tabs}}"]')
    if (!bookmarkBarToggle) {
      console.error(`[Brave Settings Overrides] Couldn't find bookmark bar toggle`)
    } else {
      bookmarkBarToggle.insertAdjacentHTML('afterend', `
        <settings-brave-appearance-toolbar prefs="{{prefs}}"></settings-brave-appearance-toolbar>
      `)
    }
    const zoomLevel = templateContent.getElementById('zoomLevel')
    if (!zoomLevel || !zoomLevel.parentNode) {
      console.error(`[Brave Settings Overrides] Couldn't find zoomLevel`)
    } else {
      zoomLevel.parentNode.insertAdjacentHTML('afterend', `
        <settings-toggle-button
          class="hr"
          pref="{{prefs.brave.mru_cycling_enabled}}"
          label="${I18nBehavior.i18n('mruCyclingSettingLabel')}">
        </settings-toggle-button>
      `)
      const isSpeedreaderEnabled = loadTimeData.getBoolean('isSpeedreaderFeatureEnabled')
      if (isSpeedreaderEnabled) {
        zoomLevel.parentNode.insertAdjacentHTML('afterend', `
          <settings-toggle-button
            class="hr"
            pref="{{prefs.brave.speedreader.enabled}}"
            label="${I18nBehavior.i18n('speedreaderSettingLabel')}"
            sub-label="${I18nBehavior.i18n('speedreaderSettingSubLabel')}"
            learn-more-url="${I18nBehavior.i18n('speedreaderLearnMoreURL')}">
          </settings-toggle-button>
      `)
      }
    }

    // <if expr="is_macosx">
    const confirmToQuit = templateContent.querySelector('[pref="{{prefs.browser.confirm_to_quit}}"]')
    if (!confirmToQuit) {
      console.error(`[Brave Settings Overrides] Couldn't find confirm to quit`)
    } else {
      confirmToQuit.remove()
    }
    // </if>

    // Super referral themes prefs
    const pages = templateContent.getElementById('pages')
    if (!pages) {
      console.error(`[Brave Settings Overrides] Couldn't find appearance_page #pages`)
    } else {
      pages.insertAdjacentHTML('beforeend', `
        <template is="dom-if" route-path="/themes">
          <settings-subpage
          associated-control="[[$$('#themes-subpage-trigger')]]"
          page-title="${I18nBehavior.i18n('themes')}">
            <settings-brave-appearance-super-referral prefs="{{prefs}}">
            </settings-brave-appearance-super-referral>
          </settings-subpage>
        </template>
      `)
    }
  },
})

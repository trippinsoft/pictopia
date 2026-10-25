/* eslint-disable */

import { Platform } from 'react-native';
import { Appearance } from 'react-native';

// On web, Appearance.setColorScheme is not implemented
// See https://github.com/necolas/react-native-web/issues/2703
//
// This reimplementation is a workaround to allow the app to switch between light and dark schemes
// by storing the selection in the data-theme attribute of the document element.
if (Platform.OS === 'web') {
  Appearance.setColorScheme = (scheme) => {
    document.documentElement.setAttribute('data-theme', scheme);
  };

  Appearance.getColorScheme = () => {
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    const userValue = document.documentElement.getAttribute('data-theme');
    return userValue && userValue !== 'null' ? userValue : systemValue;
  };

  Appearance.addChangeListener = (listener) => {
    // Listen for changes of system value
    const systemValueListener = (e) => {
      const newSystemValue = e.matches ? 'dark' : 'light';
      const userValue = document.documentElement.getAttribute('data-theme');
      listener({
        colorScheme: userValue && userValue !== 'null' ? userValue : newSystemValue,
      });
    };
    const systemValue = window.matchMedia('(prefers-color-scheme: dark)');
    systemValue.addEventListener('change', systemValueListener);

    // Listen for changes of user set value
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.attributeName === 'data-theme') {
          listener({ colorScheme: Appearance.getColorScheme() });
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });

    function remove() {
      systemValue.removeEventListener('change', systemValueListener);
      observer.disconnect();
    }

    return { remove };
  };
}

import React from "react";
import lightTheme from "@/theming/themes/light";
import darkTheme from "@/theming/themes/dark";
import { ScrollViewStyleReset } from "expo-router/html";

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/*
          This viewport disables scaling which makes the mobile website act more like a native app.
          However this does reduce built-in accessibility. If you want to enable scaling, use this instead:
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        */}
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1.00001,viewport-fit=cover"
        />
        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        <script dangerouslySetInnerHTML={{ __html: bootstrapAppearance }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html, body {
  background-color: ${lightTheme.colors.background};
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${darkTheme.colors.background}; color-scheme: dark; }
}
html[data-theme="light"], html[data-theme="light"] body {
  background-color: ${lightTheme.colors.background}; color-scheme: light;
}
html[data-theme="dark"], html[data-theme="dark"] body {
  background-color: ${darkTheme.colors.background}; color-scheme: dark;
}`;

// Paint the persisted appearance before the bundle and fonts are ready.
// IndexedDB remains authoritative; this small cache only prevents a startup flash.
const bootstrapAppearance = `(function(){try{
  var mode=localStorage.getItem("pictopia.appearance");
  if(mode!=="light"&&mode!=="dark")return;
  document.documentElement.setAttribute("data-theme",mode);
}catch(error){}})();`;

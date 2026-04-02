const path = require('path');

/**
 * - Drop ModuleScopePlugin so we can import from ../src later if needed.
 * - @project → repo src (unused in minimal article; kept for next steps).
 */
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const plugins = webpackConfig.resolve.plugins || [];
      const idx = plugins.findIndex(
        (p) => p && p.constructor && p.constructor.name === 'ModuleScopePlugin'
      );
      if (idx > -1) {
        plugins.splice(idx, 1);
      }
      webpackConfig.resolve.plugins = plugins;
      webpackConfig.resolve.alias = {
        ...(webpackConfig.resolve.alias || {}),
        '@project': path.resolve(__dirname, '..', 'src'),
      };
      return webpackConfig;
    },
  },
};

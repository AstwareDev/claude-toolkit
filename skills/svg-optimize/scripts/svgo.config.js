module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          cleanupNumericValues: { floatPrecision: 2 },
        },
      },
    },
    'removeDimensions',
    'convertStyleToAttrs',
    { name: 'convertPathData', params: { floatPrecision: 2, transformPrecision: 2 } },
    'mergePaths',
  ],
};

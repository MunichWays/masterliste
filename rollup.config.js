import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'main.js',
  output: {
    file: 'dist/main.js',
  },
  plugins: [
    nodeResolve({ preferBuiltins: false }),
    commonjs(),
  ]
};
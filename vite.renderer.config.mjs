import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue'; // 1. 引入 Vue 插件

// https://vitejs.dev/config
export default defineConfig({
  plugins:[
    vue() // 2. 在 plugins 数组中启用它
  ],
  // 下面可能还有你模板自带的其他配置，比如 resolve、build 等，保留它们即可
});
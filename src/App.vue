<template>
  <div id="app">
    <h1>时丰系统标签码打印</h1>
    <p>先生成标签码，然后导出PDF</p>
    <ProductLabel />
  </div>
</template>

<script>
import ProductLabel from './components/ProductLabel.vue'

export default {
  name: 'App',
  components: {
    ProductLabel
  },
  mounted() {
    console.log('App 组件已挂载')
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>

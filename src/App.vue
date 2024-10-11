<template>
  <div id="app">
    <h1>测试页面</h1>
    <p>如果您能看到这段文字，说明 App.vue 已正确加载</p>
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

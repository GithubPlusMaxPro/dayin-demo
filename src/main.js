import { createApp } from 'vue'
import App from './App.vue'
import ProductLabel from './components/ProductLabel.vue'

const app = createApp(App)
app.component('ProductLabel', ProductLabel)
app.mount('#app')

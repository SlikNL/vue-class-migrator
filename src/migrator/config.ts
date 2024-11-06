import { supportedPropDecorators as vuexDecorators } from './vuex';
import { supportedDecorators as vueClassPropertyDecorators } from './vue-property-decorator';

const vueSpecialMethods = [
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeUnmount',
  'unmounted',
  'errorCaptured',
  'renderTracked',
  'renderTriggered',
  'activated',
  'deactivated',
  'serverPrefetch',
  'destroyed',
]; // Vue methods that won't be included under methods: {...}, they go to the root.

// These are also located at a root of components
const nuxtSpecialMethods = [
  'beforeRouteEnter',
  'beforeRouteUpdate',
  'beforeRouteLeave',
  'asyncData',
  'fetch',
  'fetchOnServer',
  'head',
  'key',
  'layout',
  'loading',
  'middleware',
  'scrollToTop',
  'transition',
  'validate',
  'watchQuery',
  'meta',
];

export const lifecycleHooks = [...vueSpecialMethods, ...nuxtSpecialMethods];

export const supportedDecorators = [
  ...vuexDecorators,
  ...vueClassPropertyDecorators,
]; // Class Property decorators

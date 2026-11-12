import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'developpement',
        component: () => import('../pages/DevelopmentPage.vue')
      },
      {
        path: 'architecture',
        name: 'architecture',
        component: () => import('../pages/ArchitecturePage.vue')
      },
      { path: 'projet', name: 'projet', component: () => import('../pages/ProjectPage.vue') },
      { path: 'documentation', name: 'documentation', component: () => import('../pages/DocumentationPage.vue') },
      { path: 'fichiers', name: 'fichiers', component: () => import('../pages/FilesPage.vue') },
      {
        path: 'a-traiter',
        name: 'a-traiter',
        component: () => import('../pages/InboxPage.vue')
      },
      { path: 'options', name: 'options', component: () => import('../pages/SettingsPage.vue') },
      {
        path: 'stats',
        name: 'stats',
        component: () => import('../pages/StatsPage.vue')
      }
    ]
  }
];

export default routes;

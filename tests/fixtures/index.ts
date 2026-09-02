/**
 * Тестийн ГАНЦ хаалга: `import { test, expect } from '../../fixtures'`.
 *
 * `data.ts` нь `auth.ts`-ийг өргөтгөдөг тул энэ нэг `test` дээр ролийн
 * хуудсууд (`managerPage`, `factoryPage`, `financePage`) БА дата фабрик
 * (`data`) хоёул сууна. Фикстурууд залхуу — тест хүсээгүй бол үүсэхгүй.
 */
export { test, expect } from './data';
export { USERS, assertAuthenticated, type Role } from './auth';
export { type DataFactory, type CreatedClient, type CreatedContract,
         type CreatedMaterial, type RentSetup } from './data';

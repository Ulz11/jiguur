/* Ажилтны мөрийг PUT-ээр засах бэлтгэл.
 *
 * `PUT /api/salary/employees/{id}` нь БҮТЭН `EmployeeIn`-г хүлээж авдаг: явуулаагүй
 * талбар нь анхны утгаараа (0, "", false) бичигдэнэ. Мөр дээр нэг талбар засахад
 * үлдсэнийг нь дагуулж явуулахгүй бол цалин ЧИМЭЭГҮЙ 0 болно — тиймээс бүтэн
 * биеийг угсрах ажил энд цэвэр функц болж, тестээр барьцаалагдана.
 */

export type EmployeeRow = {
  id: number;
  name: string;
  role_title?: string;
  type: string;                 // main | contract | daily
  monthly_salary?: number;
  daily_rate?: number;
  ndsh?: boolean;
  active?: number;
};

export type EmployeeBody = {
  name: string;
  role_title: string;
  type: string;
  monthly_salary: number;
  daily_rate: number;
  ndsh: boolean;
};

export function empBody(e: EmployeeRow, patch: Partial<EmployeeBody>): EmployeeBody {
  return {
    name: e.name,
    role_title: e.role_title || "",
    type: e.type,
    monthly_salary: e.monthly_salary || 0,
    daily_rate: e.daily_rate || 0,
    ndsh: !!e.ndsh,
    ...patch,
  };
}

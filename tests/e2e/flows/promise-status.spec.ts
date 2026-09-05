import { test, expect } from '../../fixtures';
import { CollectionsPage } from '../../pages/CollectionsPage';

/**
 * АМЛАЛТЫГ ХААХ — «Амлалт зөрчсөн» тоолуур БУУРДАГ БОЛОВ.
 *
 * Отгоо «Даваа гарагт 5 сая шилжүүлнэ» гэсэн амлалтыг бичдэг ч түүнийг
 * ХААХ арга БАЙГААГҮЙ: харилцагч мөнгөө төлсөн ч мөр нь нээлттэй хэвээр
 * тоологдоод, дашбоардын улаан мэдэгдэл («N харилцагч амлалтаа биелүүлээгүй»)
 * ҮҮРД үлддэг. Тоолуур хэзээ ч буурахгүй бол хүн түүнийг уншихаа болино.
 */
test('амлалтыг «Биелсэн ✓» гэж хааж болно — төлөв мөрөн дээрээ үлдэнэ',
  async ({ managerPage, data }) => {
    /* Хамгийн БАГА дата: нэг цикл хэтэрсэн байхад л харилцагч залгах
       жагсаалтад орно (тестийн DB-г дэмий өсгөхгүй). */
    const { client } = await data.rentSetup({ startDaysAgo: 40, qty: 5 });
    /* Нээлттэй амлалт — «маргааш 500,000₮ төлнө». */
    const promised = await data.api.post(`/api/clients/${client.id}/notes`, {
      data: { date: data.isoDaysAgo(1), kind: 'call',
              note: 'утсаар ярив — маргааш төлнө',
              promise_date: data.isoDaysAgo(-1), promise_amount: 500_000 },
    });
    expect(promised.ok(), await promised.text()).toBeTruthy();

    const page = new CollectionsPage(managerPage);
    await page.goto();
    const row = page.row(client.name);
    await expect(row, `«${client.name}» авлагын жагсаалтад алга`).toBeVisible();

    /* Амлалтын дүн нь ДУГУЙЛАГДСАН — бүтэн төгрөг нь ил мөрөнд */
    await expect(row.getByText('яг 500,000₮'),
                 'амлалтын бүтэн дүн зөвхөн title дотор нуугдлаа').toBeVisible();

    const kept = row.getByRole('button', { name: /амлалт биелсэн гэж хаах/ });
    const broken = row.getByRole('button', { name: /амлалт зөрчсөн гэж хаах/ });
    await expect(kept, '«Биелсэн ✓» товч алга — амлалт хаагдахгүй').toBeVisible();
    await expect(broken, '«Зөрчсөн» товч алга').toBeVisible();
    /* Хоёулаа гар хүрэх шатанд (36px) */
    for (const b of [kept, broken]) {
      const box = (await b.boundingBox())!;
      expect(Math.round(box.height), 'амлалт хаах товч 36px-т хүрэхгүй')
        .toBeGreaterThanOrEqual(36);
    }

    await kept.click();

    /* Төлөв нь МӨРӨН ДЭЭР үлдэнэ — «яагаад тоолуур буурав?» гэсэн хариулт */
    await expect(row.getByText('Биелсэн ✓'),
                 'хаагдсан амлалтын төлөв мөрөн дээр гарсангүй').toBeVisible();
    /* Хаагдсаны дараа дахин хаах товч гарахгүй */
    await expect(row.getByRole('button', { name: /амлалт биелсэн гэж хаах/ }))
      .toHaveCount(0);

    /* «Амласан» шүүлтүүр нь түүнийг ЦААШИД тоолохгүй */
    await expect(managerPage.getByRole('button', { name: /^Амлалт зөрчсөн/ }))
      .toBeVisible();
  });

/**
 * ШҮҮЛТҮҮР БА ЭРЭМБЭ НЬ ХАЯГАН ДЭЭР — буцах товч тэднийг сэргээнэ.
 *
 * Урьд нь `useState`-д сууж байсан: Отгоо «Амлалт зөрчсөн» гэж шүүгээд нэг
 * харилцагч руу орж, буцах товч дарахад ЖАГСААЛТ БҮГД болж эргэн ирдэг —
 * тэр дөнгөж хаана байснаа алдана.
 */
test('шүүлтүүр ба эрэмбэ хаяган дээр — буцах товч тэднийг сэргээнэ',
  async ({ managerPage, data }) => {
    /* 130 хоног — эхний цикл [130, 100) нь 100 хоногийн өмнө төлөгдөх ёстой
       байсан тул «90+ хоног» шүүлтүүрт ҮНЭХЭЭР орно (95 хоног дээр хамгийн
       хуучин хэтрэлт нь 65 хоног болж, шүүлтүүр хоосон гардаг байв). */
    const { client } = await data.rentSetup({ startDaysAgo: 130, qty: 5 });

    const page = new CollectionsPage(managerPage);
    await page.goto();

    await managerPage.getByRole('button', { name: /^90\+ хоног/ }).click();
    await expect(managerPage).toHaveURL(/\?state=old/);

    await managerPage.getByRole('button', { name: /^Хамгийн хуучин —/ }).click();
    await expect(managerPage, 'эрэмбэ хаягтаа буусангүй').toHaveURL(/sort=oldest-/);

    /* Харилцагч руу орж, буцаж ирэхэд ХОЁУЛАА байрандаа */
    await managerPage.getByRole('link', { name: client.name, exact: true }).first().click();
    await expect(managerPage.getByRole('heading', { level: 1 })).toContainText(client.name);
    await managerPage.goBack();

    await expect(page.title).toBeVisible();
    await expect(managerPage, 'буцаж ирэхэд шүүлтүүр «бүгд» рүү унав')
      .toHaveURL(/state=old/);
    await expect(managerPage, 'буцаж ирэхэд эрэмбэ анхны байдалдаа унав')
      .toHaveURL(/sort=oldest-/);
    await expect(managerPage.getByRole('button', { name: /^90\+ хоног/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

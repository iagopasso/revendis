describe('Revendis Mobile', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('shows the home screen', async () => {
    await expect(element(by.text('Revendis Mobile'))).toBeVisible();
  });
});

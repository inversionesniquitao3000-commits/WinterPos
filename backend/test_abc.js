async function test() {
  try {
    const res = await fetch('http://localhost:5000/api/reports/inventory-abc?days=90&metric=sales');
    const data = await res.json();
    console.log('ABC Report success:', data.success);
    console.log('Items count:', data.items?.length);
    console.log('Summary:', data.summary);
    if (data.items && data.items.length > 0) {
      console.log('Sample item:', data.items[0]);
    }
  } catch (err) {
    console.error('Error testing ABC report:', err.message);
  }
}
test();

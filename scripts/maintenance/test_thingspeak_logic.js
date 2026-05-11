
const THINGSPEAK_FIELD_KEYS = [
  'field1', 'field2', 'field3', 'field4',
  'field5', 'field6', 'field7', 'field8',
];

function deriveAvailableFields(response) {
  const { channel, feeds = [] } = response;

  return THINGSPEAK_FIELD_KEYS.filter((key) => {
    // 1. A field is "available" if it has a custom label/name in the channel metadata.
    const hasLabel = channel[key] && channel[key].trim() !== '';
    if (hasLabel) return true;

    // 2. OR if at least one feed entry in the sample has a non-null value for it.
    const hasData = feeds.some((feed) => feed[key] != null && feed[key] !== '');
    return hasData;
  }).map((key) => ({
    key,
    label: (channel[key] && channel[key].trim() !== '')
      ? (channel[key])
      : `Field ${key.replace('field', '')}`,
  }));
}

// Test Case 1: Fields 1-3 have labels and data, 6-7 have labels but NO data in last entry.
const mockResponse1 = {
  channel: {
    field1: 'Temp',
    field2: 'Humidity',
    field3: 'Pressure',
    field6: 'Battery',
    field7: 'Signal'
  },
  feeds: [
    { field1: '25', field2: '60', field3: '1013', field6: null, field7: null }
  ]
};

console.log('Test Case 1 (Labels present for 6,7):');
console.log(JSON.stringify(deriveAvailableFields(mockResponse1), null, 2));

// Test Case 2: No labels, but data present in field 4.
const mockResponse2 = {
  channel: {},
  feeds: [
    { field4: 'test' }
  ]
};

console.log('\nTest Case 2 (No labels, data in field 4):');
console.log(JSON.stringify(deriveAvailableFields(mockResponse2), null, 2));

// Test Case 3: Empty feeds, but labels present.
const mockResponse3 = {
  channel: { field8: 'Alert' },
  feeds: []
};

console.log('\nTest Case 3 (Empty feeds, label in field 8):');
console.log(JSON.stringify(deriveAvailableFields(mockResponse3), null, 2));

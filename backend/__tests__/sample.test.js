const sum = (a, b) => a + b;

describe('Trivial Sample Test', () => {
    it('should add two numbers correctly', () => {
        expect(sum(1, 2)).toBe(3);
    });
});

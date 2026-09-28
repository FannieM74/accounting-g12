package quiz

import (
	"strings"
	"testing"
)

func TestQuestion71HasSourceContext(t *testing.T) {
	bank, err := LoadBankEmbedded()
	if err != nil {
		t.Fatal(err)
	}
	q := bank.ByID(71)
	if q == nil {
		t.Fatal("question 71 missing")
	}
	if q.Context == "" {
		t.Fatal("question 71 must show source indicators before the options")
	}
	for _, want := range []string{"current ratio", "1,5:1", "1,7:1", "acid-test", "1,0:1", "1,2:1", "22 days", "19 days", "48 days", "50 days"} {
		if !strings.Contains(q.Context, want) {
			t.Fatalf("question 71 context missing %q: %s", want, q.Context)
		}
	}
}

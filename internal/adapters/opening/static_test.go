package opening

import (
    "encoding/binary"
    "os"
    "path/filepath"
    "testing"

    "github.com/yourname/veldatlas/internal/domain"
)

// Standard Polyglot starting-position hash.
const startHash uint64 = 0x463b96181691fc9c

func TestRecommend_NoBookConfigured(t *testing.T) {
    t.Parallel()

    p := NewStaticProvider("")
    got, err := p.Recommend(domain.Snapshot{
        FEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    })
    if err != nil {
        t.Fatalf("Recommend() error = %v", err)
    }
    if len(got) != 0 {
        t.Fatalf("Recommend() returned %d items, want 0", len(got))
    }
}

func TestRecommend_MissingBookFile(t *testing.T) {
    t.Parallel()

    p := NewStaticProvider("/definitely/not/here/book.bin")
    _, err := p.Recommend(domain.Snapshot{
        FEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    })
    if err == nil {
        t.Fatalf("Recommend() error = nil, want missing file error")
    }
}

func TestRecommend_RealPolyglotLookupAndPercentages(t *testing.T) {
    t.Parallel()

    bookPath := filepath.Join(t.TempDir(), "book.bin")

    err := writePolyglotBook(bookPath, []polyEntry{
        {Key: startHash, Move: encodePolyMove("e2e4"), Weight: 20, Learn: 0},
        {Key: startHash, Move: encodePolyMove("d2d4"), Weight: 10, Learn: 0},
    })
    if err != nil {
        t.Fatalf("writePolyglotBook() error = %v", err)
    }

    p := NewStaticProvider(bookPath)
    got, err := p.Recommend(domain.Snapshot{
        FEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    })
    if err != nil {
        t.Fatalf("Recommend() error = %v", err)
    }

    if len(got) != 2 {
        t.Fatalf("len(got) = %d, want 2", len(got))
    }

    if got[0].Move != "e2e4" || got[0].Weight != 20 {
        t.Fatalf("first recommendation = %#v, want e2e4 weight 20", got[0])
    }
    if got[1].Move != "d2d4" || got[1].Weight != 10 {
        t.Fatalf("second recommendation = %#v, want d2d4 weight 10", got[1])
    }

    if got[0].Percentage < 66.0 || got[0].Percentage > 67.0 {
        t.Fatalf("first percentage = %f, want about 66.67", got[0].Percentage)
    }
    if got[1].Percentage < 33.0 || got[1].Percentage > 34.0 {
        t.Fatalf("second percentage = %f, want about 33.33", got[1].Percentage)
    }
}

func TestPolyglotMoveToUCI(t *testing.T) {
    t.Parallel()

    raw := encodePolyMove("e2e4")
    got := polyglotMoveToUCI(raw)
    if got != "e2e4" {
        t.Fatalf("polyglotMoveToUCI() = %q, want %q", got, "e2e4")
    }
}

func TestPositionHashFromFEN_StartPosition(t *testing.T) {
    t.Parallel()

    got, err := positionHashFromFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    if err != nil {
        t.Fatalf("positionHashFromFEN() error = %v", err)
    }
    if got != startHash {
        t.Fatalf("start-position hash = 0x%x, want 0x%x", got, startHash)
    }
}

type polyEntry struct {
    Key    uint64
    Move   uint16
    Weight uint16
    Learn  uint32
}

func writePolyglotBook(path string, entries []polyEntry) error {
    f, err := os.Create(path)
    if err != nil {
        return err
    }
    defer f.Close()

    for _, e := range entries {
        var buf [16]byte
        binary.BigEndian.PutUint64(buf[0:8], e.Key)
        binary.BigEndian.PutUint16(buf[8:10], e.Move)
        binary.BigEndian.PutUint16(buf[10:12], e.Weight)
        binary.BigEndian.PutUint32(buf[12:16], e.Learn)

        if _, err := f.Write(buf[:]); err != nil {
            return err
        }
    }
    return nil
}

func encodePolyMove(uci string) uint16 {
    from := squareIndex(uci[0:2])
    to := squareIndex(uci[2:4])

    var promo uint16
    if len(uci) == 5 {
        switch uci[4] {
        case 'n':
            promo = 1
        case 'b':
            promo = 2
        case 'r':
            promo = 3
        case 'q':
            promo = 4
        }
    }

    return uint16(to) | (uint16(from) << 6) | (promo << 12)
}

func squareIndex(s string) int {
    file := int(s[0] - 'a')
    rank := int(s[1] - '1')
    return rank*8 + file
}
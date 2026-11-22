// Game9K Dev Project Management Presets for Gemini Decisions API Playground
"use strict";
window.DP = window.DP || {};
window.DP.EXAMPLES = [
  {
    "id": "release-gate-r2",
    "title": "1. Kiểm duyệt gói Game lên Cloudflare R2",
    "category": "Release Ops",
    "icon": "shield",
    "modality": "JSON",
    "input": "Kiểm định gói phát hành `dino-race` v1.0.0 trước khi đẩy bất biến lên Cloudflare R2 Custom Domain (`cdn.game9k.com`).",
    "media": [
      {
        "name": "dino-race.audit.json",
        "mime_type": "application/json",
        "text": "{\n  \"slug\": \"dino-race\",\n  \"version\": \"1.0.0\",\n  \"legal_classification\": \"G2\",\n  \"gzipKb\": 32.3,\n  \"standaloneGzipKb\": 34.99,\n  \"maxGzipKb\": 125,\n  \"ok\": true,\n  \"checks\": {\n    \"zeroVideoTag\": true,\n    \"zeroEval\": true,\n    \"sandboxOpaqueOriginSafe\": true,\n    \"max_telemetry_hz\": 15,\n    \"prerollAdTimeoutMs\": 2000\n  }\n}"
      }
    ],
    "questions": [
      {
        "key": "r2_publish_ready",
        "type": "noul",
        "instructions": "Gói game có tuân thủ đầy đủ chuẩn bảo mật Sandbox, không chứa `<video>`/`eval()` và đạt ngân sách nén Gzip của Game9K không?",
        "true_description": "Dung lượng nén Gzip nhỏ hơn trần cho phép, không dùng thẻ <video> hay eval(), tương thích sandbox='allow-scripts' và tiết lưu Broadcast <= 20Hz.",
        "false_description": "Vượt trần Gzip, chứa thẻ <video> gây lỗi TikTok WebView, dùng eval() hoặc rò rỉ truy cập parent.document.cookie."
      },
      {
        "key": "deployment_lane",
        "type": "choice",
        "instructions": "Quyết định luồng triển khai CI/CD cho bản dựng này:",
        "options": [
          {
            "label": "promote_cloudflare_r2_prod",
            "description": "Đóng dấu SHA-256 và phát hành thẳng lên R2 Production + Cổng Game9K."
          },
          {
            "label": "deploy_portal_staging",
            "description": "Đẩy lên môi trường Staging để QA kiểm thử thêm trên thiết bị di động."
          },
          {
            "label": "return_for_bundle_trim",
            "description": "Yêu cầu Studio nén lại tài nguyên hoặc tách gói do vượt ngân sách KB."
          },
          {
            "label": "block_security_violation",
            "description": "Chặn phát hành ngay do vi phạm bảo mật Iframe hoặc giới hạn Realtime."
          }
        ]
      },
      {
        "key": "package_quality_score",
        "type": "score",
        "instructions": "Chấm điểm mức độ hoàn thiện kỹ thuật của gói game theo thang chuẩn Game9K:",
        "levels": [
          "Chặn phát hành: Vi phạm bảo mật Sandbox, chứa <video>/eval() hoặc vượt trần Gzip.",
          "Bản nháp Alpha: Chạy được nhưng thiếu tích hợp cầu nối SDK hoặc ngân sách sát trần.",
          "Đạt chuẩn Staging: Tương thích cổng, có manifest hợp lệ và dung lượng đạt yêu cầu.",
          "Chuẩn Flagship Production: Gói siêu nhẹ (<50KB Gzip), đầy đủ SHA-256, H5 Ads 2s timeout & KOL Stream."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": [
          {
            "type": "text",
            "text": "Kiểm định gói phát hành `dino-race` v1.0.0 trước khi đẩy bất biến lên Cloudflare R2 Custom Domain (`cdn.game9k.com`)."
          },
          {
            "type": "text",
            "text": "{\n  \"slug\": \"dino-race\",\n  \"version\": \"1.0.0\",\n  \"legal_classification\": \"G2\",\n  \"gzipKb\": 32.3,\n  \"standaloneGzipKb\": 34.99,\n  \"maxGzipKb\": 125,\n  \"ok\": true,\n  \"checks\": {\n    \"zeroVideoTag\": true,\n    \"zeroEval\": true,\n    \"sandboxOpaqueOriginSafe\": true,\n    \"max_telemetry_hz\": 15,\n    \"prerollAdTimeoutMs\": 2000\n  }\n}"
          }
        ],
        "questions": {
          "r2_publish_ready": {
            "type": "noul",
            "instructions": "Gói game có tuân thủ đầy đủ chuẩn bảo mật Sandbox, không chứa `<video>`/`eval()` và đạt ngân sách nén Gzip của Game9K không?",
            "criteria": {
              "true_description": "Dung lượng nén Gzip nhỏ hơn trần cho phép, không dùng thẻ <video> hay eval(), tương thích sandbox='allow-scripts' và tiết lưu Broadcast <= 20Hz.",
              "false_description": "Vượt trần Gzip, chứa thẻ <video> gây lỗi TikTok WebView, dùng eval() hoặc rò rỉ truy cập parent.document.cookie."
            }
          },
          "deployment_lane": {
            "type": "choice",
            "instructions": "Quyết định luồng triển khai CI/CD cho bản dựng này:",
            "criteria": {
              "promote_cloudflare_r2_prod": "Đóng dấu SHA-256 và phát hành thẳng lên R2 Production + Cổng Game9K.",
              "deploy_portal_staging": "Đẩy lên môi trường Staging để QA kiểm thử thêm trên thiết bị di động.",
              "return_for_bundle_trim": "Yêu cầu Studio nén lại tài nguyên hoặc tách gói do vượt ngân sách KB.",
              "block_security_violation": "Chặn phát hành ngay do vi phạm bảo mật Iframe hoặc giới hạn Realtime."
            }
          },
          "package_quality_score": {
            "type": "score",
            "instructions": "Chấm điểm mức độ hoàn thiện kỹ thuật của gói game theo thang chuẩn Game9K:",
            "criteria": [
              "Chặn phát hành: Vi phạm bảo mật Sandbox, chứa <video>/eval() hoặc vượt trần Gzip.",
              "Bản nháp Alpha: Chạy được nhưng thiếu tích hợp cầu nối SDK hoặc ngân sách sát trần.",
              "Đạt chuẩn Staging: Tương thích cổng, có manifest hợp lệ và dung lượng đạt yêu cầu.",
              "Chuẩn Flagship Production: Gói siêu nhẹ (<50KB Gzip), đầy đủ SHA-256, H5 Ads 2s timeout & KOL Stream."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "r2_publish_ready": {
            "type": "noul",
            "noul": 0.974667,
            "probabilities": {
              "true": 0.974667,
              "false": 0.025333
            },
            "confidence": 0.974667
          },
          "deployment_lane": {
            "type": "choice",
            "choice": "promote_cloudflare_r2_prod",
            "probabilities": {
              "promote_cloudflare_r2_prod": 0.934861,
              "deploy_portal_staging": 0.060528,
              "return_for_bundle_trim": 0.000581,
              "block_security_violation": 0.00403
            },
            "confidence": 0.934861
          },
          "package_quality_score": {
            "type": "score",
            "score": 2.8825,
            "most_likely_level": 3,
            "legend": {
              "0": "Chặn phát hành: Vi phạm bảo mật Sandbox, chứa <video>/eval() hoặc vượt trần Gzip.",
              "1": "Bản nháp Alpha: Chạy được nhưng thiếu tích hợp cầu nối SDK hoặc ngân sách sát trần.",
              "2": "Đạt chuẩn Staging: Tương thích cổng, có manifest hợp lệ và dung lượng đạt yêu cầu.",
              "3": "Chuẩn Flagship Production: Gói siêu nhẹ (<50KB Gzip), đầy đủ SHA-256, H5 Ads 2s timeout & KOL Stream."
            },
            "probabilities": {
              "0": 0,
              "1": 0.000313,
              "2": 0.116838,
              "3": 0.882849
            },
            "confidence": 0.882849
          }
        },
        "usage": {
          "total_input_tokens": 513,
          "total_output_tokens": 0,
          "total_tokens": 513
        },
        "latency_ms": 7
      }
    }
  },
  {
    "id": "nd147-legal-triage",
    "title": "2. Phân nhóm pháp lý NĐ 147/2024 & Giờ chơi U18",
    "category": "Legal & Compliance",
    "icon": "file-text",
    "modality": "Text",
    "input": "Hồ sơ trò chơi: Jurassic Sanctuary Sprint (`dino-race`). Trò chơi HTML5 tải tức thì trên trình duyệt, không yêu cầu tải bộ cài đặt. Có tích hợp Bảng xếp hạng điểm cao và Lưu đám mây qua lớp vỏ cổng Game9K (`postMessage`), nhận sự kiện bình luận một chiều từ phòng livestream của KOL. Đối tượng bao gồm học sinh dưới 18 tuổi tại Việt Nam.",
    "media": [],
    "questions": [
      {
        "key": "enforce_u18_session_lock",
        "type": "noul",
        "instructions": "Lớp vỏ cổng Game9K có bắt buộc kích hoạt bộ đếm khóa phiên 60 phút/trò chơi và 180 phút/ngày cho tài khoản dưới 18 tuổi không?",
        "true_description": "Trò chơi có kết nối cổng tài khoản/bảng xếp hạng (G1/G2) phục vụ người chơi tại Việt Nam theo Nghị định 147/2024/NĐ-CP.",
        "false_description": "Bản nháp thử nghiệm nội bộ không mở cho người dùng dưới 18 tuổi."
      },
      {
        "key": "legal_classification",
        "type": "choice",
        "instructions": "Phân loại nhóm trò chơi điện tử theo Nghị định 147/2024/NĐ-CP:",
        "options": [
          {
            "label": "g1_server_multiplayer",
            "description": "Có sự tương tác trực tiếp nhiều người chơi thông qua hệ thống máy chủ trò chơi trung tâm."
          },
          {
            "label": "g2_portal_leaderboard",
            "description": "Chỉ có sự tương tác giữa người chơi với hệ thống máy chủ (Bảng xếp hạng, Cloud Save) trên trình duyệt."
          },
          {
            "label": "g3_offline_download",
            "description": "Có tải bộ cài đặt về máy nhưng không tương tác qua máy chủ."
          },
          {
            "label": "g4_instant_client_only",
            "description": "Chạy 100% trên trình duyệt phía máy khách, không tải về và không kết nối máy chủ."
          }
        ]
      },
      {
        "key": "regulatory_risk",
        "type": "score",
        "instructions": "Đánh giá mức độ yêu cầu thủ tục pháp lý trước khi mở rộng quy mô:",
        "levels": [
          "Thấp nhất (G4 Thuần): Triển khai tức thì, không lưu dữ liệu máy chủ.",
          "Tiêu chuẩn (G2 Cổng Web): Cần thông báo G2/G3/G4 và bật bộ đếm giờ chơi U18 60p/180p.",
          "Trung bình cao: Có hiển thị tên/bình luận livestream cần bộ lọc từ khóa và kiểm duyệt.",
          "Cao (G1): Đòi hỏi Quyết định phê duyệt nội dung kịch bản G1 và hạ tầng định danh đầy đủ."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": "Hồ sơ trò chơi: Jurassic Sanctuary Sprint (`dino-race`). Trò chơi HTML5 tải tức thì trên trình duyệt, không yêu cầu tải bộ cài đặt. Có tích hợp Bảng xếp hạng điểm cao và Lưu đám mây qua lớp vỏ cổng Game9K (`postMessage`), nhận sự kiện bình luận một chiều từ phòng livestream của KOL. Đối tượng bao gồm học sinh dưới 18 tuổi tại Việt Nam.",
        "questions": {
          "enforce_u18_session_lock": {
            "type": "noul",
            "instructions": "Lớp vỏ cổng Game9K có bắt buộc kích hoạt bộ đếm khóa phiên 60 phút/trò chơi và 180 phút/ngày cho tài khoản dưới 18 tuổi không?",
            "criteria": {
              "true_description": "Trò chơi có kết nối cổng tài khoản/bảng xếp hạng (G1/G2) phục vụ người chơi tại Việt Nam theo Nghị định 147/2024/NĐ-CP.",
              "false_description": "Bản nháp thử nghiệm nội bộ không mở cho người dùng dưới 18 tuổi."
            }
          },
          "legal_classification": {
            "type": "choice",
            "instructions": "Phân loại nhóm trò chơi điện tử theo Nghị định 147/2024/NĐ-CP:",
            "criteria": {
              "g1_server_multiplayer": "Có sự tương tác trực tiếp nhiều người chơi thông qua hệ thống máy chủ trò chơi trung tâm.",
              "g2_portal_leaderboard": "Chỉ có sự tương tác giữa người chơi với hệ thống máy chủ (Bảng xếp hạng, Cloud Save) trên trình duyệt.",
              "g3_offline_download": "Có tải bộ cài đặt về máy nhưng không tương tác qua máy chủ.",
              "g4_instant_client_only": "Chạy 100% trên trình duyệt phía máy khách, không tải về và không kết nối máy chủ."
            }
          },
          "regulatory_risk": {
            "type": "score",
            "instructions": "Đánh giá mức độ yêu cầu thủ tục pháp lý trước khi mở rộng quy mô:",
            "criteria": [
              "Thấp nhất (G4 Thuần): Triển khai tức thì, không lưu dữ liệu máy chủ.",
              "Tiêu chuẩn (G2 Cổng Web): Cần thông báo G2/G3/G4 và bật bộ đếm giờ chơi U18 60p/180p.",
              "Trung bình cao: Có hiển thị tên/bình luận livestream cần bộ lọc từ khóa và kiểm duyệt.",
              "Cao (G1): Đòi hỏi Quyết định phê duyệt nội dung kịch bản G1 và hạ tầng định danh đầy đủ."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "enforce_u18_session_lock": {
            "type": "noul",
            "noul": 0.994989,
            "probabilities": {
              "true": 0.994989,
              "false": 0.005011
            },
            "confidence": 0.994989
          },
          "legal_classification": {
            "type": "choice",
            "choice": "g2_portal_leaderboard",
            "probabilities": {
              "g1_server_multiplayer": 0.024098,
              "g2_portal_leaderboard": 0.825198,
              "g3_offline_download": 0.109246,
              "g4_instant_client_only": 0.041458
            },
            "confidence": 0.825198
          },
          "regulatory_risk": {
            "type": "score",
            "score": 1.4613,
            "most_likely_level": 2,
            "legend": {
              "0": "Thấp nhất (G4 Thuần): Triển khai tức thì, không lưu dữ liệu máy chủ.",
              "1": "Tiêu chuẩn (G2 Cổng Web): Cần thông báo G2/G3/G4 và bật bộ đếm giờ chơi U18 60p/180p.",
              "2": "Trung bình cao: Có hiển thị tên/bình luận livestream cần bộ lọc từ khóa và kiểm duyệt.",
              "3": "Cao (G1): Đòi hỏi Quyết định phê duyệt nội dung kịch bản G1 và hạ tầng định danh đầy đủ."
            },
            "probabilities": {
              "0": 0.053678,
              "1": 0.431325,
              "2": 0.514966,
              "3": 0.000031
            },
            "confidence": 0.514966
          }
        },
        "usage": {
          "total_input_tokens": 476,
          "total_output_tokens": 0,
          "total_tokens": 476
        },
        "latency_ms": 4
      }
    }
  },
  {
    "id": "pr-security-review",
    "title": "3. Duyệt PR: Chặn rò rỉ Iframe & Trần Supabase",
    "category": "Code Review",
    "icon": "braces",
    "modality": "Text",
    "input": "diff --git a/public/games/new-racer/main.js b/public/games/new-racer/main.js\n+function gameLoop() {\n+  // Đồng bộ tọa độ 60 lần/giây qua Supabase Presence\n+  roomChannel.track({ x: dino.x, y: dino.y, speed: dino.speed });\n+  const best = window.parent.document.cookie;\n+  requestAnimationFrame(gameLoop);\n+}",
    "media": [],
    "questions": [
      {
        "key": "introduces_platform_risk",
        "type": "noul",
        "instructions": "Bản diff này có vi phạm quy tắc cô lập Sandbox của Game9K hoặc làm sập hạn mức Supabase Realtime không?",
        "true_description": "Gọi `Presence.track()` trong vòng lặp 60fps (vượt trần 5 lần/30s), truy cập `parent.document.cookie`, dùng `eval()` hoặc thêm thẻ `<video>`.",
        "false_description": "Sử dụng `Game9K.broadcastTick()` tiết lưu <= 20Hz và giao tiếp an toàn qua `postMessage`."
      },
      {
        "key": "pr_review_action",
        "type": "choice",
        "instructions": "Hành động duyệt Pull Request từ Tech Lead:",
        "options": [
          {
            "label": "block_merge",
            "description": "Chặn gộp nhánh ngay lập tức do lỗi bảo mật hoặc phá vỡ hạn mức hạ tầng."
          },
          {
            "label": "request_sdk_refactor",
            "description": "Yêu cầu chuyển sang `Game9K.broadcastTick()` (<=15Hz) và `Game9K.storage`."
          },
          {
            "label": "approve_with_comments",
            "description": "An toàn về kiến trúc, chỉ góp ý nhỏ về phong cách mã nguồn."
          },
          {
            "label": "approve_clean_merge",
            "description": "Đạt chuẩn 100%, sẵn sàng gộp vào nhánh `main`."
          }
        ]
      },
      {
        "key": "blast_radius",
        "type": "score",
        "instructions": "Nếu đoạn mã này lọt lên Production, phạm vi ảnh hưởng lớn tới mức nào?",
        "levels": [
          "Không ảnh hưởng: Chỉ chạm tài liệu hoặc kiểm thử nội bộ.",
          "Cục bộ: Chỉ gây lỗi hiển thị nhỏ trong một màn chơi.",
          "Diện rộng: Làm ngắt kết nối toàn bộ phòng đua Realtime (`ClientPresenceRateLimitReached`).",
          "Nghiêm trọng toàn cổng: Rò rỉ bảo mật phiên người dùng hoặc bùng nổ chi phí đám mây."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": "diff --git a/public/games/new-racer/main.js b/public/games/new-racer/main.js\n+function gameLoop() {\n+  // Đồng bộ tọa độ 60 lần/giây qua Supabase Presence\n+  roomChannel.track({ x: dino.x, y: dino.y, speed: dino.speed });\n+  const best = window.parent.document.cookie;\n+  requestAnimationFrame(gameLoop);\n+}",
        "questions": {
          "introduces_platform_risk": {
            "type": "noul",
            "instructions": "Bản diff này có vi phạm quy tắc cô lập Sandbox của Game9K hoặc làm sập hạn mức Supabase Realtime không?",
            "criteria": {
              "true_description": "Gọi `Presence.track()` trong vòng lặp 60fps (vượt trần 5 lần/30s), truy cập `parent.document.cookie`, dùng `eval()` hoặc thêm thẻ `<video>`.",
              "false_description": "Sử dụng `Game9K.broadcastTick()` tiết lưu <= 20Hz và giao tiếp an toàn qua `postMessage`."
            }
          },
          "pr_review_action": {
            "type": "choice",
            "instructions": "Hành động duyệt Pull Request từ Tech Lead:",
            "criteria": {
              "block_merge": "Chặn gộp nhánh ngay lập tức do lỗi bảo mật hoặc phá vỡ hạn mức hạ tầng.",
              "request_sdk_refactor": "Yêu cầu chuyển sang `Game9K.broadcastTick()` (<=15Hz) và `Game9K.storage`.",
              "approve_with_comments": "An toàn về kiến trúc, chỉ góp ý nhỏ về phong cách mã nguồn.",
              "approve_clean_merge": "Đạt chuẩn 100%, sẵn sàng gộp vào nhánh `main`."
            }
          },
          "blast_radius": {
            "type": "score",
            "instructions": "Nếu đoạn mã này lọt lên Production, phạm vi ảnh hưởng lớn tới mức nào?",
            "criteria": [
              "Không ảnh hưởng: Chỉ chạm tài liệu hoặc kiểm thử nội bộ.",
              "Cục bộ: Chỉ gây lỗi hiển thị nhỏ trong một màn chơi.",
              "Diện rộng: Làm ngắt kết nối toàn bộ phòng đua Realtime (`ClientPresenceRateLimitReached`).",
              "Nghiêm trọng toàn cổng: Rò rỉ bảo mật phiên người dùng hoặc bùng nổ chi phí đám mây."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "introduces_platform_risk": {
            "type": "noul",
            "noul": 0.99563,
            "probabilities": {
              "true": 0.99563,
              "false": 0.00437
            },
            "confidence": 0.99563
          },
          "pr_review_action": {
            "type": "choice",
            "choice": "block_merge",
            "probabilities": {
              "block_merge": 0.779003,
              "request_sdk_refactor": 0.1921,
              "approve_with_comments": 0.025998,
              "approve_clean_merge": 0.002899
            },
            "confidence": 0.779003
          },
          "blast_radius": {
            "type": "score",
            "score": 2.7622,
            "most_likely_level": 3,
            "legend": {
              "0": "Không ảnh hưởng: Chỉ chạm tài liệu hoặc kiểm thử nội bộ.",
              "1": "Cục bộ: Chỉ gây lỗi hiển thị nhỏ trong một màn chơi.",
              "2": "Diện rộng: Làm ngắt kết nối toàn bộ phòng đua Realtime (`ClientPresenceRateLimitReached`).",
              "3": "Nghiêm trọng toàn cổng: Rò rỉ bảo mật phiên người dùng hoặc bùng nổ chi phí đám mây."
            },
            "probabilities": {
              "0": 0,
              "1": 0.000416,
              "2": 0.236994,
              "3": 0.76259
            },
            "confidence": 0.76259
          }
        },
        "usage": {
          "total_input_tokens": 432,
          "total_output_tokens": 0,
          "total_tokens": 432
        },
        "latency_ms": 4
      }
    }
  },
  {
    "id": "kol-stream-readiness",
    "title": "4. Kiểm định kịch bản KOL TikTok & YouTube Live 24/7",
    "category": "KOL Live Ops",
    "icon": "video",
    "modality": "JSON",
    "input": "Đánh giá cấu hình phòng phát trực tiếp của KOL trước chiến dịch cuối tuần trên cả TikTok LIVE Studio (9:16) và YouTube Live (16:9).",
    "media": [
      {
        "name": "kol-stream-config.json",
        "mime_type": "application/json",
        "text": "{\n  \"modes\": [\n    \"KOL_DERBY_4_TEAMS\",\n    \"VIEWER_STAMPEDE_24_AVATARS\"\n  ],\n  \"platforms\": [\n    \"tiktok_webcast_v2\",\n    \"youtube_data_api_and_innertube\"\n  ],\n  \"giftTiers\": {\n    \"rose_1_coin\": \"Nitro +45 Fury\",\n    \"meat_5_coins\": \"Full Fury 3s Surge\",\n    \"banana_10_coins\": \"Smart Top-1 Skid Trap\",\n    \"meteor_20_coins\": \"Leader Stun Strike\",\n    \"crown_99_coins\": \"King Aura + Golden Goat Rain\"\n  },\n  \"betweenRaceGiftQueue\": true,\n  \"avatarProxyCorsSafe\": \"/api/avatar\",\n  \"reconnectBackoff\": \"2s..32s +/-30% jitter\",\n  \"layouts\": [\n    \"16x9\",\n    \"9x16\",\n    \"transparent_webcam_overlay\"\n  ]\n}"
      }
    ],
    "questions": [
      {
        "key": "unattended_24_7_ready",
        "type": "noul",
        "instructions": "Cấu hình trò chơi đã đủ điều kiện treo tự động 24/7 trên OBS / TikTok LIVE Studio mà không làm rơi quà của khán giả giữa hai chặng đua chưa?"
      },
      {
        "key": "kol_ops_recommendation",
        "type": "choice",
        "instructions": "Khuyến nghị vận hành tiếp theo cho đội ngũ KOL Partnership:",
        "options": [
          {
            "label": "launch_kol_campaign",
            "description": "Cấp link Browser Source chính thức cho danh sách KOL lên sóng ngay."
          },
          {
            "label": "rebalance_gift_economy",
            "description": "Tinh chỉnh lại ngưỡng xu của Thiên Thạch / Vương Miện cho hợp túi tiền khán giả."
          },
          {
            "label": "harden_stream_reconnect",
            "description": "Bổ sung cơ chế tự kết nối lại khi đứt luồng TikTok/YouTube."
          },
          {
            "label": "adjust_portrait_hud",
            "description": "Căn lại vùng an toàn 9:16 tránh bị khung bình luận TikTok che khuất."
          }
        ]
      },
      {
        "key": "viewer_hype_score",
        "type": "score",
        "instructions": "Đánh giá sức hút giữ chân người xem và kích thích tặng quà (Live Retention & Monetization):",
        "levels": [
          "Thấp: Vòng lặp tĩnh, ít phản hồi trực quan khi khán giả bình luận.",
          "Trung bình: Có chia đội chat 1-4 nhưng thiếu cao trào lật kèo cuối trận.",
          "Khá tốt: Có bảng vinh danh Top 3 Mạnh Thường Quân và hiệu ứng quà rõ nét.",
          "Bùng nổ Viral: Đua 24 Avatar chính chủ + Bẫy Chuối/Thiên Thạch lật kèo Top 1 + Lưu quà giữa chặng."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": [
          {
            "type": "text",
            "text": "Đánh giá cấu hình phòng phát trực tiếp của KOL trước chiến dịch cuối tuần trên cả TikTok LIVE Studio (9:16) và YouTube Live (16:9)."
          },
          {
            "type": "text",
            "text": "{\n  \"modes\": [\n    \"KOL_DERBY_4_TEAMS\",\n    \"VIEWER_STAMPEDE_24_AVATARS\"\n  ],\n  \"platforms\": [\n    \"tiktok_webcast_v2\",\n    \"youtube_data_api_and_innertube\"\n  ],\n  \"giftTiers\": {\n    \"rose_1_coin\": \"Nitro +45 Fury\",\n    \"meat_5_coins\": \"Full Fury 3s Surge\",\n    \"banana_10_coins\": \"Smart Top-1 Skid Trap\",\n    \"meteor_20_coins\": \"Leader Stun Strike\",\n    \"crown_99_coins\": \"King Aura + Golden Goat Rain\"\n  },\n  \"betweenRaceGiftQueue\": true,\n  \"avatarProxyCorsSafe\": \"/api/avatar\",\n  \"reconnectBackoff\": \"2s..32s +/-30% jitter\",\n  \"layouts\": [\n    \"16x9\",\n    \"9x16\",\n    \"transparent_webcam_overlay\"\n  ]\n}"
          }
        ],
        "questions": {
          "unattended_24_7_ready": {
            "type": "noul",
            "instructions": "Cấu hình trò chơi đã đủ điều kiện treo tự động 24/7 trên OBS / TikTok LIVE Studio mà không làm rơi quà của khán giả giữa hai chặng đua chưa?"
          },
          "kol_ops_recommendation": {
            "type": "choice",
            "instructions": "Khuyến nghị vận hành tiếp theo cho đội ngũ KOL Partnership:",
            "criteria": {
              "launch_kol_campaign": "Cấp link Browser Source chính thức cho danh sách KOL lên sóng ngay.",
              "rebalance_gift_economy": "Tinh chỉnh lại ngưỡng xu của Thiên Thạch / Vương Miện cho hợp túi tiền khán giả.",
              "harden_stream_reconnect": "Bổ sung cơ chế tự kết nối lại khi đứt luồng TikTok/YouTube.",
              "adjust_portrait_hud": "Căn lại vùng an toàn 9:16 tránh bị khung bình luận TikTok che khuất."
            }
          },
          "viewer_hype_score": {
            "type": "score",
            "instructions": "Đánh giá sức hút giữ chân người xem và kích thích tặng quà (Live Retention & Monetization):",
            "criteria": [
              "Thấp: Vòng lặp tĩnh, ít phản hồi trực quan khi khán giả bình luận.",
              "Trung bình: Có chia đội chat 1-4 nhưng thiếu cao trào lật kèo cuối trận.",
              "Khá tốt: Có bảng vinh danh Top 3 Mạnh Thường Quân và hiệu ứng quà rõ nét.",
              "Bùng nổ Viral: Đua 24 Avatar chính chủ + Bẫy Chuối/Thiên Thạch lật kèo Top 1 + Lưu quà giữa chặng."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "unattended_24_7_ready": {
            "type": "noul",
            "noul": 0.984177,
            "probabilities": {
              "true": 0.984177,
              "false": 0.015823
            },
            "confidence": 0.984177
          },
          "kol_ops_recommendation": {
            "type": "choice",
            "choice": "launch_kol_campaign",
            "probabilities": {
              "launch_kol_campaign": 0.557872,
              "rebalance_gift_economy": 0.038003,
              "harden_stream_reconnect": 0.20523,
              "adjust_portrait_hud": 0.198895
            },
            "confidence": 0.557872
          },
          "viewer_hype_score": {
            "type": "score",
            "score": 2.5736,
            "most_likely_level": 3,
            "legend": {
              "0": "Thấp: Vòng lặp tĩnh, ít phản hồi trực quan khi khán giả bình luận.",
              "1": "Trung bình: Có chia đội chat 1-4 nhưng thiếu cao trào lật kèo cuối trận.",
              "2": "Khá tốt: Có bảng vinh danh Top 3 Mạnh Thường Quân và hiệu ứng quà rõ nét.",
              "3": "Bùng nổ Viral: Đua 24 Avatar chính chủ + Bẫy Chuối/Thiên Thạch lật kèo Top 1 + Lưu quà giữa chặng."
            },
            "probabilities": {
              "0": 0,
              "1": 0.001798,
              "2": 0.422824,
              "3": 0.575378
            },
            "confidence": 0.575378
          }
        },
        "usage": {
          "total_input_tokens": 508,
          "total_output_tokens": 0,
          "total_tokens": 508
        },
        "latency_ms": 2
      }
    }
  },
  {
    "id": "solana-milestone-unlock",
    "title": "5. Quản trị mở khóa chặng Token Solana cho Studio",
    "category": "Web3 Treasury",
    "icon": "chart-column",
    "modality": "JSON",
    "input": "Báo cáo đối soát Telemetry tuần đầu của Studio phát triển `Jurassic Sanctuary Sprint` trên cổng Game9K để xét duyệt giải ngân chặng Milestone #2.",
    "media": [
      {
        "name": "portal-telemetry-week1.json",
        "mime_type": "application/json",
        "text": "{\n  \"studioId\": \"sanctuary-labs\",\n  \"gameId\": \"dino-race\",\n  \"verifiedOriginChecks\": \"100% event.source === iframe.contentWindow\",\n  \"sessionsStarted\": 1840,\n  \"sessionsCompleted\": 1412,\n  \"completionRate\": 0.767,\n  \"medianSessionSec\": 215,\n  \"kolLiveRoomsActive\": 14,\n  \"botAnomalyFlags\": 0\n}"
      }
    ],
    "questions": [
      {
        "key": "approve_token_tranche",
        "type": "noul",
        "instructions": "Chỉ số người chơi thực và tỷ lệ hoàn thành chặng đua (`completionRate`) đã đủ điều kiện mở khóa đợt phân bổ token tiếp theo cho Studio chưa?"
      },
      {
        "key": "treasury_action",
        "type": "choice",
        "instructions": "Quyết định từ Hội đồng Quản trị Ngân quỹ Game9K (Treasury Ops):",
        "options": [
          {
            "label": "unlock_100pct_tranche",
            "description": "Giải ngân 100% chặng token Milestone #2 qua hợp đồng thông minh Solana."
          },
          {
            "label": "unlock_50pct_partial",
            "description": "Giải ngân 50% và theo dõi thêm chỉ số giữ chân ngày D7."
          },
          {
            "label": "extend_kpi_window",
            "description": "Gia hạn 14 ngày để Studio tích lũy thêm lượt hoàn thành phiên chơi."
          },
          {
            "label": "freeze_bot_audit",
            "description": "Đóng băng tạm thời để điều tra dấu hiệu cày lượt tự động (bot farm)."
          }
        ]
      },
      {
        "key": "kpi_maturity_score",
        "type": "score",
        "instructions": "Đánh giá độ tin cậy và sức khỏe tăng trưởng của trò chơi trên cổng:",
        "levels": [
          "Rủi ro / Nghi vấn ảo: Dữ liệu bất thường hoặc tỷ lệ hoàn thành dưới 15%.",
          "Giai đoạn sớm: Tín hiệu thật nhưng quy mô mẫu còn nhỏ (<100 phiên).",
          "Đạt chuẩn KPI: Tỷ lệ hoàn thành >50%, thời lượng phiên ổn định, xác thực nguồn Iframe.",
          "Tăng trưởng Flagship: Tỷ lệ hoàn thành >70% kèm hiệu ứng lan tỏa từ nhiều phòng KOL Live."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": [
          {
            "type": "text",
            "text": "Báo cáo đối soát Telemetry tuần đầu của Studio phát triển `Jurassic Sanctuary Sprint` trên cổng Game9K để xét duyệt giải ngân chặng Milestone #2."
          },
          {
            "type": "text",
            "text": "{\n  \"studioId\": \"sanctuary-labs\",\n  \"gameId\": \"dino-race\",\n  \"verifiedOriginChecks\": \"100% event.source === iframe.contentWindow\",\n  \"sessionsStarted\": 1840,\n  \"sessionsCompleted\": 1412,\n  \"completionRate\": 0.767,\n  \"medianSessionSec\": 215,\n  \"kolLiveRoomsActive\": 14,\n  \"botAnomalyFlags\": 0\n}"
          }
        ],
        "questions": {
          "approve_token_tranche": {
            "type": "noul",
            "instructions": "Chỉ số người chơi thực và tỷ lệ hoàn thành chặng đua (`completionRate`) đã đủ điều kiện mở khóa đợt phân bổ token tiếp theo cho Studio chưa?"
          },
          "treasury_action": {
            "type": "choice",
            "instructions": "Quyết định từ Hội đồng Quản trị Ngân quỹ Game9K (Treasury Ops):",
            "criteria": {
              "unlock_100pct_tranche": "Giải ngân 100% chặng token Milestone #2 qua hợp đồng thông minh Solana.",
              "unlock_50pct_partial": "Giải ngân 50% và theo dõi thêm chỉ số giữ chân ngày D7.",
              "extend_kpi_window": "Gia hạn 14 ngày để Studio tích lũy thêm lượt hoàn thành phiên chơi.",
              "freeze_bot_audit": "Đóng băng tạm thời để điều tra dấu hiệu cày lượt tự động (bot farm)."
            }
          },
          "kpi_maturity_score": {
            "type": "score",
            "instructions": "Đánh giá độ tin cậy và sức khỏe tăng trưởng của trò chơi trên cổng:",
            "criteria": [
              "Rủi ro / Nghi vấn ảo: Dữ liệu bất thường hoặc tỷ lệ hoàn thành dưới 15%.",
              "Giai đoạn sớm: Tín hiệu thật nhưng quy mô mẫu còn nhỏ (<100 phiên).",
              "Đạt chuẩn KPI: Tỷ lệ hoàn thành >50%, thời lượng phiên ổn định, xác thực nguồn Iframe.",
              "Tăng trưởng Flagship: Tỷ lệ hoàn thành >70% kèm hiệu ứng lan tỏa từ nhiều phòng KOL Live."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "approve_token_tranche": {
            "type": "noul",
            "noul": 0.946076,
            "probabilities": {
              "true": 0.946076,
              "false": 0.053924
            },
            "confidence": 0.946076
          },
          "treasury_action": {
            "type": "choice",
            "choice": "unlock_100pct_tranche",
            "probabilities": {
              "unlock_100pct_tranche": 0.793923,
              "unlock_50pct_partial": 0.101079,
              "extend_kpi_window": 0.101079,
              "freeze_bot_audit": 0.003919
            },
            "confidence": 0.793923
          },
          "kpi_maturity_score": {
            "type": "score",
            "score": 2.2113,
            "most_likely_level": 2,
            "legend": {
              "0": "Rủi ro / Nghi vấn ảo: Dữ liệu bất thường hoặc tỷ lệ hoàn thành dưới 15%.",
              "1": "Giai đoạn sớm: Tín hiệu thật nhưng quy mô mẫu còn nhỏ (<100 phiên).",
              "2": "Đạt chuẩn KPI: Tỷ lệ hoàn thành >50%, thời lượng phiên ổn định, xác thực nguồn Iframe.",
              "3": "Tăng trưởng Flagship: Tỷ lệ hoàn thành >70% kèm hiệu ứng lan tỏa từ nhiều phòng KOL Live."
            },
            "probabilities": {
              "0": 0.000002,
              "1": 0.023185,
              "2": 0.74229,
              "3": 0.234523
            },
            "confidence": 0.74229
          }
        },
        "usage": {
          "total_input_tokens": 418,
          "total_output_tokens": 0,
          "total_tokens": 418
        },
        "latency_ms": 2
      }
    }
  },
  {
    "id": "multimodal-bug-triage",
    "title": "6. Phân luồng báo lỗi QA / Livestream đa phương thức",
    "category": "QA Triage",
    "icon": "audio-lines",
    "modality": "Text",
    "input": "Báo cáo khẩn từ KOL @MinhAnhGaming lúc 21:15 tối Thứ Bảy: 'Đang phát trực tiếp 1.800 mắt xem trên TikTok LIVE Studio thì mạng Wi-Fi chập chờn 5 giây; sau đó bình luận 1-4 chạy lại bình thường nhưng ảnh đại diện của một số bạn khán giả mới bên YouTube hiển thị vòng tròn chữ viết tắt thay vì ảnh thật. Đường đua 60 FPS không bị giật.' (Có thể đính kèm thêm ảnh chụp màn hình, video OBS, file âm thanh hoặc log JSON để kiểm định đa phương thức).",
    "media": [],
    "questions": [
      {
        "key": "is_live_showstopper",
        "type": "noul",
        "instructions": "Sự cố này có làm sập luồng phát trực tiếp hiện tại hoặc đòi hỏi dừng khẩn cấp phiên đua của KOL không?"
      },
      {
        "key": "assigned_squad",
        "type": "choice",
        "instructions": "Đội kỹ thuật nào chịu trách nhiệm chính xử lý phiếu việc (ticket) này?",
        "options": [
          {
            "label": "tiktok_youtube_gateway",
            "description": "Đội Gateway Livestream, Avatar Proxy (`/api/avatar`) & chuẩn hóa sự kiện."
          },
          {
            "label": "game_canvas_physics",
            "description": "Đội Đồ họa HTML5 Canvas 2D, Vật lý đường đua & Web Audio."
          },
          {
            "label": "portal_sandbox_sdk",
            "description": "Đội SDK Cầu nối Iframe, Lưu trữ đám mây & Bảng xếp hạng."
          },
          {
            "label": "ads_monetization_ops",
            "description": "Đội Tích hợp Quảng cáo Google H5 & Thanh toán."
          }
        ]
      },
      {
        "key": "bug_priority",
        "type": "score",
        "instructions": "Mức độ ưu tiên xếp vào Sprint hiện tại:",
        "levels": [
          "P3 Nhỏ (Cosmetic): Đã có cơ chế dự phòng SVG Avatar an toàn, sửa ở bản cập nhật thường kỳ.",
          "P2 Trung bình: Ảnh hưởng trải nghiệm phụ nhưng có cách lách tự động, xử lý trong Sprint.",
          "P1 Cao: Lỗi tính năng cốt lõi làm giảm tương tác khán giả, cần vá trong 24h.",
          "P0 Khẩn cấp: Sập máy chủ phòng Live hoặc mất quà tặng của khán giả, cần hotfix ngay."
        ]
      }
    ],
    "recorded": {
      "request": {
        "model": "gemini-decision-1",
        "input": "Báo cáo khẩn từ KOL @MinhAnhGaming lúc 21:15 tối Thứ Bảy: 'Đang phát trực tiếp 1.800 mắt xem trên TikTok LIVE Studio thì mạng Wi-Fi chập chờn 5 giây; sau đó bình luận 1-4 chạy lại bình thường nhưng ảnh đại diện của một số bạn khán giả mới bên YouTube hiển thị vòng tròn chữ viết tắt thay vì ảnh thật. Đường đua 60 FPS không bị giật.' (Có thể đính kèm thêm ảnh chụp màn hình, video OBS, file âm thanh hoặc log JSON để kiểm định đa phương thức).",
        "questions": {
          "is_live_showstopper": {
            "type": "noul",
            "instructions": "Sự cố này có làm sập luồng phát trực tiếp hiện tại hoặc đòi hỏi dừng khẩn cấp phiên đua của KOL không?"
          },
          "assigned_squad": {
            "type": "choice",
            "instructions": "Đội kỹ thuật nào chịu trách nhiệm chính xử lý phiếu việc (ticket) này?",
            "criteria": {
              "tiktok_youtube_gateway": "Đội Gateway Livestream, Avatar Proxy (`/api/avatar`) & chuẩn hóa sự kiện.",
              "game_canvas_physics": "Đội Đồ họa HTML5 Canvas 2D, Vật lý đường đua & Web Audio.",
              "portal_sandbox_sdk": "Đội SDK Cầu nối Iframe, Lưu trữ đám mây & Bảng xếp hạng.",
              "ads_monetization_ops": "Đội Tích hợp Quảng cáo Google H5 & Thanh toán."
            }
          },
          "bug_priority": {
            "type": "score",
            "instructions": "Mức độ ưu tiên xếp vào Sprint hiện tại:",
            "criteria": [
              "P3 Nhỏ (Cosmetic): Đã có cơ chế dự phòng SVG Avatar an toàn, sửa ở bản cập nhật thường kỳ.",
              "P2 Trung bình: Ảnh hưởng trải nghiệm phụ nhưng có cách lách tự động, xử lý trong Sprint.",
              "P1 Cao: Lỗi tính năng cốt lõi làm giảm tương tác khán giả, cần vá trong 24h.",
              "P0 Khẩn cấp: Sập máy chủ phòng Live hoặc mất quà tặng của khán giả, cần hotfix ngay."
            ]
          }
        }
      },
      "response": {
        "model": "gemini-decision-1",
        "engine": "game9k-calibrated-decisions",
        "answers": {
          "is_live_showstopper": {
            "type": "noul",
            "noul": 0.383665,
            "probabilities": {
              "true": 0.383665,
              "false": 0.616335
            },
            "confidence": 0.616335
          },
          "assigned_squad": {
            "type": "choice",
            "choice": "game_canvas_physics",
            "probabilities": {
              "tiktok_youtube_gateway": 0.316854,
              "game_canvas_physics": 0.577346,
              "portal_sandbox_sdk": 0.035808,
              "ads_monetization_ops": 0.069992
            },
            "confidence": 0.577346
          },
          "bug_priority": {
            "type": "score",
            "score": 0.3036,
            "most_likely_level": 0,
            "legend": {
              "0": "P3 Nhỏ (Cosmetic): Đã có cơ chế dự phòng SVG Avatar an toàn, sửa ở bản cập nhật thường kỳ.",
              "1": "P2 Trung bình: Ảnh hưởng trải nghiệm phụ nhưng có cách lách tự động, xử lý trong Sprint.",
              "2": "P1 Cao: Lỗi tính năng cốt lõi làm giảm tương tác khán giả, cần vá trong 24h.",
              "3": "P0 Khẩn cấp: Sập máy chủ phòng Live hoặc mất quà tặng của khán giả, cần hotfix ngay."
            },
            "probabilities": {
              "0": 0.696739,
              "1": 0.302875,
              "2": 0.000386,
              "3": 0
            },
            "confidence": 0.696739
          }
        },
        "usage": {
          "total_input_tokens": 401,
          "total_output_tokens": 0,
          "total_tokens": 401
        },
        "latency_ms": 2
      }
    }
  }
];

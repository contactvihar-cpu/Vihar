import { GoogleLogin } from "@react-oauth/google";

export default function GoogleButton({ onSuccess }) {
  return (
    <div style={{ marginTop: 15 }}>
      <GoogleLogin
        onSuccess={(res) => {
          onSuccess(res.credential);
        }}
        onError={() => {
          console.log("Google Login Failed");
        }}
      />
    </div>
  );
}

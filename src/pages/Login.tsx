import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../integrations/supabase/client';
import { Sun } from 'lucide-react';

const LoginPage = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-2 bg-orange-500 rounded-lg">
          <Sun className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-800">HelioScope</h1>
          <p className="text-md text-gray-500">Sign in to continue</p>
        </div>
      </div>
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          theme="light"
        />
      </div>
    </div>
  );
};

export default LoginPage;